const Replicate = require("replicate");

module.exports = async (req, res) => {
    // 1. Toàn bộ nội dung bọc trong Try...Catch để bắt lỗi 500 chi tiết
    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ message: 'Method Not Allowed' });
        }

        const { prompts, prompt, imageBase64, negative_prompt } = req.body;
        
        // KIỂM TRA TOKEN TRƯỚC KHI KHỞI TẠO
        if (!process.env.REPLICATE_API_TOKEN) {
            console.error('TOKEN IS MISSING IN ENV!');
            throw new Error('REPLICATE_API_TOKEN is not defined in environment variables.');
        }

        // 2. Khởi tạo Replicate chính xác 100% như yêu cầu
        const replicate = new Replicate({ 
            auth: process.env.REPLICATE_API_TOKEN 
        });

        const STABILITY_API_KEY = process.env.STABILITY_API_KEY;

        console.log('--- API Token Check ---');
        console.log('REPLICATE_API_TOKEN:', process.env.REPLICATE_API_TOKEN ? 'DETECTED (OK)' : 'MISSING');
        console.log('STABILITY_API_KEY:', STABILITY_API_KEY ? 'DETECTED (OK)' : 'MISSING');

        if (!process.env.REPLICATE_API_TOKEN && !STABILITY_API_KEY) {
            throw new Error('Chưa cấu hình API Key (REPLICATE_API_TOKEN hoặc STABILITY_API_KEY) trên Vercel.');
        }

        if (!imageBase64) {
            return res.status(400).json({ message: 'Thiếu dữ liệu ảnh (imageBase64).' });
        }

        // 3. Bắt buộc upload lên host trung gian, KHÔNG gửi Base64 trực tiếp vào Replicate
        let publicImageUrl = null;
        try {
            console.log('Đang upload ảnh lên tmpfiles.org...');
            publicImageUrl = await uploadToTmpFiles(imageBase64);
            console.log('Link ảnh công khai:', publicImageUrl);
        } catch (uploadErr) {
            console.error('Lỗi khi upload ảnh:', uploadErr.message);
            // Nếu dùng Replicate mà upload lỗi thì phải báo lỗi ngay vì Base64 sẽ gây crash
            if (process.env.REPLICATE_API_TOKEN && !STABILITY_API_KEY) {
                throw new Error('Không thể upload ảnh lên host trung gian để gửi cho Replicate: ' + uploadErr.message);
            }
        }

        const inputPrompts = Array.isArray(prompts) ? prompts : [prompt];
        const results = [];

        console.log(`--- Đang xử lý bộ ${inputPrompts.length} sticker ---`);

        for (const [index, currentPrompt] of inputPrompts.entries()) {
            console.log(`--- Đang tạo sticker #${index + 1} ---`);
            
            if (index > 0) {
                console.log('Nghỉ 2 giây...');
                await new Promise(r => setTimeout(r, 2000));
            }

            let stickerBuffer = null;

            try {
                // ƯU TIÊN 1: REPLICATE (Bắt buộc dùng publicImageUrl và biến replicate đã khởi tạo)
                if (process.env.REPLICATE_API_TOKEN && publicImageUrl) {
                    try {
                        stickerBuffer = await generateWithReplicate(replicate, publicImageUrl, currentPrompt, negative_prompt);
                    } catch (repError) {
                        console.error(`Replicate lỗi (sticker #${index + 1}):`, repError.message);
                    }
                }

                // FALLBACK: STABILITY AI (Vẫn dùng buffer trực tiếp vì Stability hỗ trợ tốt hơn)
                if (!stickerBuffer && STABILITY_API_KEY) {
                    try {
                        stickerBuffer = await generateWithStability(imageBase64, currentPrompt, negative_prompt, STABILITY_API_KEY);
                    } catch (stabError) {
                        console.error(`Stability AI lỗi (sticker #${index + 1}):`, stabError.message);
                    }
                }

                if (stickerBuffer) {
                    results.push(stickerBuffer.toString('base64'));
                    console.log(`✅ Sticker #${index + 1} xong.`);
                } else {
                    results.push({ error: 'Không thể tạo ảnh bằng cả 2 cách.' });
                }

            } catch (innerError) {
                console.error(`Lỗi trong vòng lặp (#${index + 1}):`, innerError.message);
                results.push({ error: innerError.message });
            }
        }

        return res.status(200).json({ images: results });

    } catch (error) {
        // Trả về lỗi chi tiết thay vì 500 chung chung
        console.error('CRITICAL BACKEND ERROR:', error);
        return res.status(500).json({ 
            error: error.message, 
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
        });
    }
};

// ====================================
// UTILS: Public Image Hosting
// ====================================
async function uploadToTmpFiles(imageBase64) {
    const buffer = Buffer.from(imageBase64, 'base64');
    const formData = new FormData();
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    formData.append('file', blob, 'input_image.jpg');

    const res = await fetch('https://tmpfiles.org/api/v1/upload', {
        method: 'POST',
        body: formData
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`TmpFiles Upload failed (${res.status}): ${text}`);
    }

    const json = await res.json();
    if (!json.data || !json.data.url) throw new Error('Cấu trúc phản hồi từ TmpFiles không đúng.');
    
    return json.data.url.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');
}

// ====================================
// REPLICATE
// ====================================
async function generateWithReplicate(replicateClient, imageUrl, prompt, negative_prompt) {
    const output = await replicateClient.run(
        "fofr/face-to-sticker:764d4827ea159608a07cdde8ddf1c6000019627515eb02b6b449695fd547e5ef",
        {
            input: {
                image: imageUrl,
                prompt: prompt,
                negative_prompt: negative_prompt || "photorealistic, 3d, realistic, cinematic, bad quality, blurry, messy, extra limbs, deformed, text, watermark",
                upscale: true,
                upscale_steps: 20
            }
        }
    );

    const outputUrl = Array.isArray(output) ? output[0] : output;
    if (!outputUrl) throw new Error('Replicate không trả về URL ảnh.');

    const imgRes = await fetch(outputUrl);
    if (!imgRes.ok) throw new Error('Không thể tải ảnh từ Replicate.');

    return Buffer.from(await imgRes.arrayBuffer());
}

// ====================================
// STABILITY AI
// ====================================
async function generateWithStability(imageBase64, prompt, negative_prompt, apiKey) {
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: 'image/png' });

    formData.append("image", blob, 'image.png');
    formData.append("prompt", prompt);
    formData.append("strength", "0.32");
    formData.append("mode", "image-to-image");
    formData.append("output_format", "png");
    if (negative_prompt) formData.append("negative_prompt", negative_prompt);

    const response = await fetch("https://api.stability.ai/v2beta/stable-image/generate/core", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + apiKey,
            "Accept": "image/*"
        },
        body: formData
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Stability API Error (${response.status}): ${errText.substring(0, 200)}`);
    }

    return Buffer.from(await response.arrayBuffer());
}
