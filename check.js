const Replicate = require("replicate");

module.exports = async (req, res) => {
    try {
        const { id } = req.query;

        // BẮT LỖI ID CHUẨN XÁC THEO YÊU CẦU CỦA BẠN
        if (!id || id === 'null' || id === 'undefined' || id === '') {
            console.error("Lỗi: ID bị thiếu hoặc không hợp lệ.");
            return res.status(400).json({ error: 'ID khong hop le' });
        }

        if (!process.env.REPLICATE_API_TOKEN) throw new Error('Token API is missing.');

        const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

        // Truy vấn trực tiếp trạng thái từ Replicate
        console.log(`Kiểm tra trạng thái ID: ${id}`);
        const prediction = await replicate.predictions.get(id);

        if (prediction.status === "succeeded") {
            // Trích xuất URL ảnh cẩn thận
            const output = prediction.output;
            const finalUrl = Array.isArray(output) ? output[0] : (typeof output === 'string' ? output : null);
            
            if (!finalUrl) {
                console.error("Lỗi: Replicate báo Succeeded nhưng không có URL ảnh.");
                throw new Error("Result URL is null");
            }

            console.log(`ID ${id} DONE! Đang tải ảnh từ: ${finalUrl}`);

            // Fetch ảnh (Đảm bảo finalUrl không phải null)
            const imgRes = await fetch(finalUrl);
            const buffer = await imgRes.arrayBuffer();
            const base64 = Buffer.from(buffer).toString('base64');

            return res.status(200).json({ 
                status: "succeeded", 
                imageUrl: `data:image/png;base64,${base64}` 
            });
        } else if (prediction.status === "failed" || prediction.status === "canceled") {
            console.error(`ID ${id} THẤT BẠI:`, prediction.error);
            return res.status(200).json({ status: "failed", error: prediction.error });
        } else {
            // Vẫn đang xử lý (starting, processing)
            console.log(`ID ${id} đang ở trạng thái: ${prediction.status}`);
            return res.status(200).json({ status: prediction.status });
        }

    } catch (error) {
        console.error('STATUS CHECK ERROR:', error.message);
        return res.status(500).json({ error: error.message });
    }
};
