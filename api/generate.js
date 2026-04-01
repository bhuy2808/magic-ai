const Replicate = require("replicate");

module.exports = async (req, res) => {
    if (process.env.REPLICATE_API_TOKEN) {
        console.log("Token check:", process.env.REPLICATE_API_TOKEN.slice(-4));
    }

    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ message: 'Method Not Allowed' });
        }

        const { prompt, imageBase64, negative_prompt } = req.body;
        
        if (!process.env.REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN is not defined.');

        const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

        if (!imageBase64) return res.status(400).json({ message: 'Thiếu imageBase64.' });

        // Loại bỏ tiền tố "data:image/...;base64," nếu có
        const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        
        // Kiểm tra dữ liệu
        const buffer = Buffer.from(cleanBase64, 'base64');
        if (buffer.length === 0) throw new Error("Dữ liệu ảnh rỗng hoặc không hợp lệ.");
        console.log(`Image buffer size: ${buffer.length} bytes`);

        // Data URI trực tiếp cho Replicate
        const imageDataUri = `data:image/jpeg;base64,${cleanBase64}`;

        const targetPrompt = prompt || "A high-quality 3D chibi sticker of Bảo Huy, cool glasses, stylish hair, cute expression, vibrant colors, die-cut white border, Pixar style, 8k resolution, highly detailed";

        // === NEGATIVE PROMPT MẠNH - Chặn ảnh xấu ===
        const defaultNegative = "ugly, blurry, low quality, distorted face, bad anatomy, text error, missing edge, deformed, disfigured, low resolution, watermark, signature, cropped, worst quality, jpeg artifacts, duplicate, morbid, mutilated, extra fingers, poorly drawn face";
        const finalNegative = (negative_prompt && negative_prompt.trim()) 
            ? `${negative_prompt}, ${defaultNegative}` 
            : defaultNegative;

        // === INPUT TINH CHỈNH CHO CHIBI/ANIME CHẤT LƯỢNG CAO ===
        // Mục tiêu: Biến đổi mạnh sang chibi/anime nhưng VẪN NHẬN RA được người gốc
        const inputPayload = {
            image: imageDataUri,
            prompt: targetPrompt,
            negative_prompt: finalNegative,
            steps: 30,                    // 30 steps cho chất lượng render cao nhất
            prompt_strength: 7,            // CFG 7 - cân bằng giữa prompt & likeness
            instant_id_strength: 0.55,     // ⭐ KEY: 0.55 = giữ nét mặt đặc trưng nhưng CHO PHÉP chibi hóa mạnh
            ip_adapter_weight: 0.15,       // 0.15 = giảm ảnh hưởng ảnh gốc để AI tự do vẽ phong cách mới
            ip_adapter_noise: 0.5,         // 0.5 = mức noise vừa phải cho output sáng tạo
            width: 1024,
            height: 1024,
        };

        console.log(`Gửi lệnh tạo sticker. Steps: ${inputPayload.steps}, CFG: ${inputPayload.prompt_strength}`);
        console.log(`Prompt: ${targetPrompt.substring(0, 100)}...`);
        console.log(`Negative: ${finalNegative.substring(0, 80)}...`);

        // Dùng predictions.create để lấy ID ngay lập tức (Async)
        const prediction = await replicate.predictions.create({
            version: "764d4827ea159608a07cdde8ddf1c6000019627515eb02b6b449695fd547e5ef",
            input: inputPayload
        });

        console.log(`Prediction ID: ${prediction.id}, Status: ${prediction.status}`);

        if (!prediction.id) {
            console.error("CRITICAL: Không có prediction.id:", JSON.stringify(prediction));
            return res.status(500).json({ error: 'Replicate không trả về prediction ID.' });
        }

        return res.status(200).json({ predictionId: prediction.id });

    } catch (error) {
        console.error('GENERATE ERROR:', error.message);
        console.error('GENERATE ERROR STACK:', error.stack);
        
        let userMessage = error.message;
        let statusCode = 500;
        
        if (error.message && (error.message.includes('429') || error.message.includes('Too Many Requests') || error.message.includes('rate limit') || error.message.includes('Rate limit'))) {
            userMessage = 'Rate limited. Đợi 1 phút rồi thử lại.';
            statusCode = 429;
        } else if (error.status === 429) {
            userMessage = 'Rate limited. Đợi 1 phút rồi thử lại.';
            statusCode = 429;
        } else if (error.message && error.message.includes('authentication')) {
            userMessage = 'Lỗi xác thực API. Kiểm tra REPLICATE_API_TOKEN.';
            statusCode = 401;
        } else if (error.message && error.message.includes('Request too large')) {
            userMessage = 'Ảnh quá lớn. Vui lòng dùng ảnh nhỏ hơn.';
            statusCode = 413;
        }
        
        return res.status(statusCode).json({ error: userMessage });
    }
};
