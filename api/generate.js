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

        const { prompt, imageBase64 } = req.body;
        
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

        const targetPrompt = prompt || "A high-quality sticker";
        console.log(`--- REPLICATE ONLY MODE ---`);
        console.log(`Prompt: ${targetPrompt}`);

        // 2. Chạy Replicate (Đã bao gồm cơ chế đợi Succeeded của SDK)
        const stickerBuffer = await generateWithReplicate(replicate, publicImageUrl, targetPrompt);

        if (stickerBuffer) {
            console.log(`✅ Sticker thành công!`);
            return res.status(200).json({ 
                images: [stickerBuffer.toString('base64')] 
            });
        } else {
            throw new Error('Không thể tạo được sticker từ Replicate.');
        }

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

    // SDK của Replicate sẽ tự động polling cho đến khi trạng thái là Succeeded
    const output = await replicateClient.run(
        "fofr/face-to-sticker:764d4827ea159608a07cdde8ddf1c6000019627515eb02b6b449695fd547e5ef",
        { input: inputData }
    );

    // LOG 'RUỘT' KẾT QUẢ ĐỂ KIỂM TRA CẤU TRÚC THỰC TẾ
    console.log("DU LIEU THO TU REPLICATE:", JSON.stringify(output));

    // Trích xuất link ảnh theo cách thô sơ và bao quát nhất
    const imageUrlResult = Array.isArray(output) 
        ? output[0] 
        : (typeof output === 'string' ? output : (output.url || output[0] || null));

    console.log("Link ảnh sau khi trích xuất:", imageUrlResult);

    if (!imageUrlResult) {
        throw new Error('Replicate không trả về URL ảnh hợp lệ trong output.');
    }

    const imgRes = await fetch(imageUrlResult);
    if (!imgRes.ok) throw new Error(`Không thể tải ảnh từ URL: ${imageUrlResult}`);

    return Buffer.from(await imgRes.arrayBuffer());
}
