// Stability AI - Structure Control Endpoint
// Sử dụng endpoint control/structure để giữ nguyên cấu trúc khuôn mặt
// khi biến đổi phong cách ảnh thành sticker

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const { prompt, imageBase64, negative_prompt } = req.body;
        const STABILITY_API_KEY = process.env.STABILITY_API_KEY;

        if (!STABILITY_API_KEY) {
            return res.status(500).json({ message: 'API key not configured in Vercel' });
        }

        if (!imageBase64) {
            return res.status(400).json({ message: 'Missing imageBase64' });
        }

        const imageBuffer = Buffer.from(imageBase64, 'base64');
        
        const formData = new FormData();
        const blob = new Blob([imageBuffer], { type: 'image/png' });
        
        formData.append("image", blob, 'image.png');
        formData.append("prompt", prompt);
        // control_strength: 0.0 đến 1.0
        // Giá trị cao hơn = giữ cấu trúc ảnh gốc tốt hơn (nét mặt, pose)
        formData.append("control_strength", "0.7");
        formData.append("output_format", "png");
        
        if (negative_prompt) {
            formData.append("negative_prompt", negative_prompt);
        }

        // Sử dụng endpoint CONTROL/STRUCTURE thay vì GENERATE/CORE
        // Endpoint này chuyên giữ nguyên cấu trúc (khuôn mặt, tư thế) của ảnh gốc
        const response = await fetch("https://api.stability.ai/v2beta/stable-image/control/structure", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${STABILITY_API_KEY}`,
                "Accept": "image/*"
            },
            body: formData
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('Stability AI Error:', errText);
            
            // Nếu endpoint structure không khả dụng, fallback về generate/core
            if (response.status === 404 || response.status === 403) {
                console.log('Fallback to generate/core endpoint...');
                const fallbackForm = new FormData();
                const fallbackBlob = new Blob([imageBuffer], { type: 'image/png' });
                fallbackForm.append("image", fallbackBlob, 'image.png');
                fallbackForm.append("prompt", prompt);
                fallbackForm.append("strength", "0.15"); // Rất thấp để giữ nét mặt tối đa
                fallbackForm.append("mode", "image-to-image");
                fallbackForm.append("output_format", "png");
                
                if (negative_prompt) {
                    fallbackForm.append("negative_prompt", negative_prompt);
                }

                const fallbackResponse = await fetch("https://api.stability.ai/v2beta/stable-image/generate/core", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${STABILITY_API_KEY}`,
                        "Accept": "image/*"
                    },
                    body: fallbackForm
                });

                if (!fallbackResponse.ok) {
                    const fallbackErr = await fallbackResponse.text();
                    console.error('Fallback Error:', fallbackErr);
                    return res.status(fallbackResponse.status).send(fallbackErr);
                }

                const fbArrayBuffer = await fallbackResponse.arrayBuffer();
                res.setHeader('Content-Type', 'image/png');
                return res.send(Buffer.from(fbArrayBuffer));
            }
            
            return res.status(response.status).send(errText);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        res.setHeader('Content-Type', 'image/png');
        res.send(buffer);

    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ message: error.message });
    }
};
