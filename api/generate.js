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

        const { prompt, imageBase64, negative_prompt } = req.body;
        
        if (!process.env.REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN is not defined.');

        const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

        if (!imageBase64) return res.status(400).json({ message: 'Thiếu imageBase64.' });

        // 1. Upload ảnh lên host trung gian (bắt buộc cho Replicate)
        let publicImageUrl;
        try {
            publicImageUrl = await uploadToTmpFiles(imageBase64);
            console.log('Link ảnh TmpFiles:', publicImageUrl);
        } catch (uploadErr) {
            console.error('Upload ảnh thất bại:', uploadErr.message);
            return res.status(500).json({ error: 'Upload ảnh thất bại: ' + uploadErr.message });
        }

        const targetPrompt = prompt || "A high-quality sticker";

        // 2. Gửi lệnh tạo Prediction (Không đợi kết quả - Asynchronous)
        console.log(`Gửi lệnh tạo sticker cho Prompt: ${targetPrompt.substring(0, 80)}...`);
        
        // Chuẩn bị input cho model
        const inputPayload = {
            image: publicImageUrl,
            prompt: targetPrompt,
        };

        // Chỉ thêm negative_prompt nếu có giá trị
        if (negative_prompt && negative_prompt.trim()) {
            inputPayload.negative_prompt = negative_prompt;
        }

        // Dùng predictions.create thay vì run() để lấy ID ngay lập tức
        const prediction = await replicate.predictions.create({
            version: "764d4827ea159608a07cdde8ddf1c6000019627515eb02b6b449695fd547e5ef",
            input: inputPayload
        });

        // LOG TOÀN BỘ PHẢN HỒI BAN ĐẦU
        console.log("PHẢN HỒI KHỞI TẠO TỪ REPLICATE:", JSON.stringify(prediction));
        console.log(`Prediction ID khoi tao: ${prediction.id}`);

        if (!prediction.id) {
            console.error("CRITICAL: Replicate trả về response nhưng KHÔNG CÓ prediction.id:", JSON.stringify(prediction));
            return res.status(500).json({ error: 'Replicate không trả về prediction ID.' });
        }

        // Trả ID về cho Frontend ngay lập tức (Hết bị lỗi 504 Timeout)
        return res.status(200).json({ predictionId: prediction.id });

    } catch (error) {
        console.error('GENERATE INITIATOR ERROR:', error);
        
        // Xử lý các lỗi cụ thể từ Replicate
        let userMessage = error.message;
        if (error.message && error.message.includes('rate limit')) {
            userMessage = 'Quá nhiều yêu cầu. Vui lòng đợi 1 phút rồi thử lại.';
        } else if (error.message && error.message.includes('authentication')) {
            userMessage = 'Lỗi xác thực API. Kiểm tra REPLICATE_API_TOKEN.';
        }
        
        return res.status(500).json({ error: userMessage });
    }
};

// --- UTILS: TmpFiles Upload ---
async function uploadToTmpFiles(imageBase64) {
    // RẤT QUAN TRỌNG: Loại bỏ tiền tố "data:image/...;base64," nếu có để tránh hỏng file
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, 'base64');
    
    // Kiểm tra buffer có dữ liệu hay không
    if (buffer.length === 0) throw new Error("Dữ liệu ảnh rỗng hoặc không hợp lệ.");
    console.log(`Image buffer size: ${buffer.length} bytes`);

    const formData = new FormData();
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    formData.append('file', blob, 'input_image.jpg');

    let retries = 2;
    let lastError = null;
    
    while (retries >= 0) {
        try {
            const uploadRes = await fetch('https://tmpfiles.org/api/v1/upload', {
                method: 'POST', body: formData
            });

            if (!uploadRes.ok) {
                const errText = await uploadRes.text();
                throw new Error(`TmpFiles Upload failed (${uploadRes.status}): ${errText.substring(0, 100)}`);
            }
            
            const json = await uploadRes.json();
            if (!json.data || !json.data.url) throw new Error("Cấu trúc phản hồi TmpFiles không đúng.");

            // Chuyển sang link download trực tiếp
            const directUrl = json.data.url.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');
            console.log("Direct Image URL for Replicate:", directUrl);
            return directUrl;
        } catch (err) {
            lastError = err;
            retries--;
            if (retries >= 0) {
                console.warn(`TmpFiles upload retry (${2 - retries}/2):`, err.message);
                await new Promise(r => setTimeout(r, 1000)); // Đợi 1s trước khi retry
            }
        }
    }
    
    throw lastError;
}
