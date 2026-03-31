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
        console.log(`--- Đang kiểm tra ID: ${id} ---`);
        const prediction = await replicate.predictions.get(id);

        // LOG TOÀN BỘ ĐỐI TƯỢNG ĐỂ BIẾT "RUỘT" CỦA NÓ
        console.log("DỮ LIỆU THÔ TỪ REPLICATE:", JSON.stringify(prediction));

        if (prediction.status === "succeeded") {
            const output = prediction.output;
            let finalUrl = null;

            if (Array.isArray(output)) {
                finalUrl = output[0];
            } else if (typeof output === 'string') {
                finalUrl = output;
            } else if (output && typeof output === 'object') {
                // Một số model trả về { url: '...' } hoặc { image: '...' }
                finalUrl = output.url || output.image || output.file;
            }
            
            if (!finalUrl) {
                console.error("Lỗi: Không tìm thấy URL trong output:", JSON.stringify(output));
                throw new Error("Result URL is missing from output");
            }

            console.log(`CHÉP ĐƯỢC LINK: ${finalUrl}`);

            // Tải ảnh và chuyển sang Base64
            const imgRes = await fetch(finalUrl);
            if (!imgRes.ok) throw new Error(`Fetch image failed with status ${imgRes.status}`);

            const buffer = await imgRes.arrayBuffer();
            const base64 = Buffer.from(buffer).toString('base64');

            return res.status(200).json({ 
                status: "succeeded", 
                imageUrl: `data:image/png;base64,${base64}` 
            });
        } else if (prediction.status === "failed" || prediction.status === "canceled") {
            console.error(`ERROR: AI trả về lỗi: ${prediction.error}`);
            return res.status(200).json({ status: "failed", error: prediction.error });
        } else {
            // Vẫn đang xử lý (starting, processing)
            console.log(`Status: ${prediction.status}`);
            return res.status(200).json({ status: prediction.status });
        }

    } catch (error) {
        console.error('STATUS CHECK ERROR:', error.message);
        return res.status(500).json({ error: error.message });
    }
};
