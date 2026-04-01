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
        console.log(`--- KIỂM TRA ID: ${id} ---`);
        const prediction = await replicate.predictions.get(id);

        // LOG TOÀN BỘ "RUỘT" CỦA PREDICTION (CỰC KỲ QUAN TRỌNG)
        console.log("DỮ LIỆU THÔ REPLICATE:", JSON.stringify(prediction));

        if (prediction.status === "succeeded") {
            const output = prediction.output;
            let finalUrl = null;

            // Logic tìm Link ảnh "không lối thoát":
            if (Array.isArray(output)) {
                // Nếu là mảng lồng nhau [[URL]], hoặc mảng bình thường [URL]
                finalUrl = Array.isArray(output[0]) ? output[0][0] : output[0];
            } else if (typeof output === 'string') {
                finalUrl = output;
            } else if (output && typeof output === 'object') {
                finalUrl = output.url || output.image || output.file || output.output;
            }
            
            if (!finalUrl) {
                console.error("LỖI: AI báo Done nhưng KHÔNG tìm thấy link ảnh trong Output:", JSON.stringify(output));
                return res.status(200).json({ status: "succeeded", error: "Output URL missing", rawOutput: output });
            }

            console.log(`ĐÃ TÌM THẤY LINK ẢNH: ${finalUrl}`);

            // Thử chuyển sang Base64 để tránh CORS, nếu lỗi thì trả về Link gốc
            try {
                const imgRes = await fetch(finalUrl);
                if (imgRes.ok) {
                    const buffer = await imgRes.arrayBuffer();
                    const base64 = Buffer.from(buffer).toString('base64');
                    return res.status(200).json({ 
                        status: "succeeded", 
                        imageUrl: `data:image/png;base64,${base64}`,
                        originalUrl: finalUrl
                    });
                }
            } catch (e) {
                console.warn("Không thể chuyển Base64, trả về Link gốc:", e.message);
            }

            // Fallback: Trả về link gốc nếu không Base64 được
            return res.status(200).json({ 
                status: "succeeded", 
                imageUrl: finalUrl, // Trình duyệt vẫn hiển thị được link gôc
                isRawUrl: true 
            });

        } else if (prediction.status === "failed" || prediction.status === "canceled") {
            console.error(`AI THẤT BẠI: ${prediction.error}`);
            return res.status(200).json({ status: "failed", error: prediction.error });
        } else {
            console.log(`Trạng thái: ${prediction.status}`);
            return res.status(200).json({ status: prediction.status });
        }

    } catch (error) {
        console.error('STATUS CHECK ERROR:', error.message);
        return res.status(500).json({ error: error.message });
    }
};
