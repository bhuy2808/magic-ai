const Replicate = require("replicate");

module.exports = async (req, res) => {
    // LOG KIỂM TRA QUYỀN TRUY CẬP
    if (process.env.REPLICATE_API_TOKEN) {
        console.log("Token check:", process.env.REPLICATE_API_TOKEN.slice(-4));
    }

    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ message: 'Method Not Allowed' });
        }

        const { prompt, imageBase64 } = req.body;
        
        if (!process.env.REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN is not defined.');

        const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

        if (!imageBase64) return res.status(400).json({ message: 'Thiếu imageBase64.' });

        // 1. Upload ảnh lên host trung gian (bắt buộc cho Replicate)
        let publicImageUrl = await uploadToTmpFiles(imageBase64);
        console.log('Link ảnh TmpFiles:', publicImageUrl);

        const targetPrompt = prompt || "A high-quality sticker";

        // 2. Gửi lệnh tạo Prediction (Không đợi kết quả - Asynchronous)
        console.log(`Gửi lệnh tạo sticker cho Prompt: ${targetPrompt}`);
        
        // Dùng predictions.create thay vì run() để lấy ID ngay lập tức
        const prediction = await replicate.predictions.create({
            version: "764d4827ea159608a07cdde8ddf1c6000019627515eb02b6b449695fd547e5ef",
            input: {
                image: publicImageUrl,
                prompt: targetPrompt
            }
        });

        console.log(`Prediction ID khoi tao: ${prediction.id}`);

        // Trả ID về cho Frontend ngay lập tức (Hết bị lỗi 504 Timeout)
        return res.status(200).json({ predictionId: prediction.id });

    } catch (error) {
        console.error('GENERATE INITIATOR ERROR:', error);
        return res.status(500).json({ error: error.message });
    }
};

// --- UTILS: TmpFiles Upload ---
async function uploadToTmpFiles(imageBase64) {
    const buffer = Buffer.from(imageBase64, 'base64');
    const formData = new FormData();
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    formData.append('file', blob, 'input_image.jpg');

    const res = await fetch('https://tmpfiles.org/api/v1/upload', {
        method: 'POST', body: formData
    });

    if (!res.ok) throw new Error(`TmpFiles Upload failed (${res.status})`);
    
    const json = await res.json();
    return json.data.url.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');
}
