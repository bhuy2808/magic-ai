const Replicate = require("replicate");

module.exports = async (req, res) => {
    try {
        const { id } = req.query;

        // BẮT LỖI ID CHUẨN XÁC
        if (!id || id === 'null' || id === 'undefined' || id === '') {
            console.error("Lỗi: ID bị thiếu hoặc không hợp lệ.");
            return res.status(400).json({ error: 'ID khong hop le' });
        }

        if (!process.env.REPLICATE_API_TOKEN) throw new Error('Token API is missing.');

        const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

        // Truy vấn trực tiếp trạng thái từ Replicate
        console.log(`--- KIỂM TRA ID: ${id} ---`);
        const prediction = await replicate.predictions.get(id);

        console.log(`Status: ${prediction.status}`);

        if (prediction.status === "succeeded") {
            const output = prediction.output;
            let finalUrl = null;

            // Logic tìm Link ảnh:
            if (Array.isArray(output)) {
                // Model face-to-sticker trả về mảng URLs [url1, url2]
                // URL đầu tiên là ảnh sticker đã xóa nền
                finalUrl = Array.isArray(output[0]) ? output[0][0] : output[0];
            } else if (typeof output === 'string') {
                finalUrl = output;
            } else if (output && typeof output === 'object') {
                finalUrl = output.url || output.image || output.file || output.output;
            }
            
            if (!finalUrl) {
                console.error("LỖI: AI Done nhưng KHÔNG tìm thấy link ảnh:", JSON.stringify(output));
                return res.status(200).json({ status: "succeeded", error: "Output URL missing", rawOutput: output });
            }

            console.log(`ĐÃ TÌM THẤY LINK ẢNH: ${finalUrl}`);

            // Thử chuyển sang Base64 để tránh CORS
            try {
                const imgRes = await fetch(finalUrl, {
                    headers: {
                        'Accept': 'image/*',
                    },
                    signal: AbortSignal.timeout(15000) // 15s timeout cho việc fetch ảnh
                });

                if (imgRes.ok) {
                    const contentType = imgRes.headers.get('content-type') || 'image/png';
                    const buffer = await imgRes.arrayBuffer();
                    
                    if (buffer.byteLength === 0) {
                        console.warn("Ảnh rỗng (0 bytes), trả về link gốc");
                        return res.status(200).json({ 
                            status: "succeeded", 
                            imageUrl: finalUrl,
                            isRawUrl: true 
                        });
                    }

                    const base64 = Buffer.from(buffer).toString('base64');
                    console.log(`Base64 converted: ${base64.length} chars, type: ${contentType}`);
                    
                    return res.status(200).json({ 
                        status: "succeeded", 
                        imageUrl: `data:${contentType};base64,${base64}`,
                        originalUrl: finalUrl
                    });
                } else {
                    console.warn(`Fetch ảnh thất bại (${imgRes.status}), trả về link gốc`);
                }
            } catch (e) {
                console.warn("Không thể chuyển Base64:", e.message);
            }

            // Fallback: Trả về link gốc nếu không Base64 được
            return res.status(200).json({ 
                status: "succeeded", 
                imageUrl: finalUrl,
                isRawUrl: true 
            });

        } else if (prediction.status === "failed" || prediction.status === "canceled") {
            console.error(`AI THẤT BẠI: ${prediction.error}`);
            return res.status(200).json({ status: "failed", error: prediction.error || "Unknown error" });
        } else {
            // starting, processing
            console.log(`Trạng thái: ${prediction.status}`);
            return res.status(200).json({ status: prediction.status });
        }

    } catch (error) {
        console.error('STATUS CHECK ERROR:', error.message);
        return res.status(500).json({ error: error.message });
    }
};
