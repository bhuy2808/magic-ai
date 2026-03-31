const Replicate = require("replicate");

module.exports = async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: "Missing prediction ID" });

        if (!process.env.REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN is not defined.');

        const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

        // Lấy trạng thái mới nhất từ Replicate
        const prediction = await replicate.predictions.get(id);

        console.log(`Checking ID: ${id} | Status: ${prediction.status}`);

        if (prediction.status === "succeeded") {
            // Trích xuất URL ảnh
            const output = prediction.output;
            const finalUrl = Array.isArray(output) ? output[0] : output;
            
            // Tải ảnh và chuyển sang Base64 để Frontend hiển thị dễ dàng (tránh CORS)
            const imgRes = await fetch(finalUrl);
            const buffer = await imgRes.arrayBuffer();
            const base64 = Buffer.from(buffer).toString('base64');

            return res.status(200).json({ 
                status: "succeeded", 
                imageUrl: `data:image/png;base64,${base64}` 
            });
        } else if (prediction.status === "failed" || prediction.status === "canceled") {
            return res.status(200).json({ status: "failed", error: prediction.error });
        } else {
            // Vẫn đang xử lý (starting, processing)
            return res.status(200).json({ status: prediction.status });
        }

    } catch (error) {
        console.error('STATUS CHECK ERROR:', error);
        return res.status(500).json({ error: error.message });
    }
};
