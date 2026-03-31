const Replicate = require("replicate");

module.exports = async (req, res) => {
    // LOG KIỂM TRA TOKEN (Chỉ hiện 4 số cuối để bảo mật)
    if (process.env.REPLICATE_API_TOKEN) {
        console.log("Token 4 so cuoi:", process.env.REPLICATE_API_TOKEN.slice(-4));
    } else {
        console.log("Token: Van bi trong");
    }

    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ message: 'Method Not Allowed' });
        }

        const { prompts, prompt, imageBase64 } = req.body;
        
        if (!process.env.REPLICATE_API_TOKEN) {
            throw new Error('REPLICATE_API_TOKEN is not defined.');
        }

        const replicate = new Replicate({ 
            auth: process.env.REPLICATE_API_TOKEN 
        });

        if (!imageBase64) {
            return res.status(400).json({ message: 'Thiếu dữ liệu ảnh (imageBase64).' });
        }

        // 1. Upload ảnh lên host trung gian (Bắt buộc cho Replicate)
        let publicImageUrl = await uploadToTmpFiles(imageBase64);
        console.log('Link ảnh công khai từ TmpFiles:', publicImageUrl);

        const inputPrompts = Array.isArray(prompts) ? prompts : [prompt || "A high-quality sticker"];
        const results = [];

        console.log(`--- CHẾ ĐỘ XẾP HÀNG: Tạo ${inputPrompts.length} sticker nối tiếp ---`);

        for (const [index, currentPrompt] of inputPrompts.entries()) {
            // Nghỉ 15 giây từ sticker thứ 2 trở đi để tránh lỗi 429
            if (index > 0) {
                console.log(`Đang chờ 15 giây trước khi tạo Sticker ${index + 1}...`);
                await new Promise(r => setTimeout(r, 15000));
            }

            console.log(`Sticker ${index + 1} bat dau...`);
            console.log(`Prompt: ${currentPrompt}`);

            try {
                // CHỈ DÙNG REPLICATE.RUN ĐỂ TỰ ĐỘNG ĐỢI KẾT QUẢ
                const stickerBuffer = await generateWithReplicate(replicate, publicImageUrl, currentPrompt);
                
                if (stickerBuffer) {
                    results.push(stickerBuffer.toString('base64'));
                    console.log(`Sticker ${index + 1} xong!`);
                } else {
                    console.error(`Sticker ${index + 1} loi: Khong co du lieu tra ve.`);
                    results.push({ error: 'Null output from Replicate' });
                }
            } catch (innerError) {
                console.error(`Sticker ${index + 1} loi nghiem trong:`, innerError.message);
                results.push({ error: innerError.message });
            }
        }

        return res.status(200).json({ images: results });

    } catch (error) {
        console.error('CRITICAL BACKEND ERROR:', error);
        return res.status(500).json({ error: error.message });
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
async function generateWithReplicate(replicateClient, imageUrl, prompt) {
    const inputData = {
        image: imageUrl,
        prompt: prompt
    };

    console.log("Gửi Input cho Replicate:", JSON.stringify(inputData));

    // Dùng replicateClient.run sẽ tự động đợi (polling) đến khi có trạng thái Succeeded
    const output = await replicateClient.run(
        "fofr/face-to-sticker:764d4827ea159608a07cdde8ddf1c6000019627515eb02b6b449695fd547e5ef",
        { input: inputData }
    );

    // KIỂM TRA LẠI KẾT QUẢ ĐỂ TRÁNH LỖI NULL
    if (!output) {
        throw new Error("AI chua kip tra ve ket qua (Output is null)");
    }

    console.log("DU LIEU THO TU REPLICATE:", JSON.stringify(output));

    // Trích xuất link ảnh cuối cùng
    const finalUrl = Array.isArray(output) ? output[0] : output;
    console.log("LINK ANH CUOI CUNG:", finalUrl);

    if (!finalUrl || typeof finalUrl !== 'string') {
        throw new Error('Replicate khong tra ve URL anh hop le.');
    }

    const imgRes = await fetch(finalUrl);
    if (!imgRes.ok) throw new Error(`Khong the tai anh tu URL: ${finalUrl}`);

    return Buffer.from(await imgRes.arrayBuffer());
}
