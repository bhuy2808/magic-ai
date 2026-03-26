// Removed node-fetch and form-data to use native Node 18+ fetch/FormData
// This ensures compatibility even without a package.json

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const { prompt, strength, imageBase64 } = req.body;
        const STABILITY_API_KEY = process.env.STABILITY_API_KEY;

        if (!STABILITY_API_KEY) {
            return res.status(500).json({ message: 'API key not configured in Vercel' });
        }

        if (!imageBase64) {
            return res.status(400).json({ message: 'Missing imageBase64' });
        }

        const imageBuffer = Buffer.from(imageBase64, 'base64');
        
        // Use native FormData (available in Node 18+)
        const formData = new FormData();
        // Native FormData.append takes a Blob/File or string. 
        // We use a Blob to represent the image buffer.
        const blob = new Blob([imageBuffer], { type: 'image/png' });
        formData.append("image", blob, 'image.png');
        formData.append("prompt", prompt);
        formData.append("strength", strength || "0.2");
        formData.append("mode", "image-to-image");
        formData.append("output_format", "png");

        const response = await fetch("https://api.stability.ai/v2beta/stable-image/generate/core", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${STABILITY_API_KEY}`,
                "Accept": "image/*"
                // Do NOT set Content-Type header manually with native FormData and fetch
            },
            body: formData
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('Stability AI Error:', errText);
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
