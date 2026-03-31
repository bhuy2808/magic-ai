const Replicate = require("replicate");

module.exports = async (req, res) => {
    try {
        const { id } = req.query;

        // BẮT LỖI ID TRỐNG HOẶC NULL (Yêu cầu của bạn)
        if (!id || id === 'null' || id === 'undefined' || id === '') {
            console.error("Lỗi: ID bị thiếu hoặc không hợp lệ.");
            return res.status(400).json({ error: 'ID bi thieu' });
        }

        if (!process.env.REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN is not defined.');

        const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

        // Lấy trạng thái mới nhất từ Replicate
        console.log(`Đang kiểm tra trạng thái cho ID: ${id}...`);
        const prediction = await replicate.predictions.get(id);

        if (prediction.status === "succeeded") {
            const output = prediction.output;
            const finalUrl = Array.isArray(output) ? output[0] : output;
            
            console.log(`ID ${id} THÀNH CÔNG! Đang xử lý ảnh...`);

            // Fetch ảnh và chuyển sang Base64
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
