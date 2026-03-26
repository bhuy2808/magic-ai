// Dual API: Replicate face-to-sticker (ưu tiên) + Stability AI (fallback)
// Replicate dùng InstantID + IP Adapter → giữ nét mặt tốt
// Stability AI → fallback nếu Replicate không có token

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const { prompt, imageBase64, negative_prompt, style } = req.body;
        const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
        const STABILITY_API_KEY = process.env.STABILITY_API_KEY;

        if (!REPLICATE_API_TOKEN && !STABILITY_API_KEY) {
            return res.status(500).json({ message: 'No API key configured. Set REPLICATE_API_TOKEN in Vercel.' });
        }

        if (!imageBase64) {
            return res.status(400).json({ message: 'Missing imageBase64' });
        }

        // ============================
        // ƯU TIÊN 1: REPLICATE
        // ============================
        if (REPLICATE_API_TOKEN) {
            try {
                const result = await generateWithReplicate(imageBase64, prompt, negative_prompt, REPLICATE_API_TOKEN);
                res.setHeader('Content-Type', 'image/png');
                return res.send(result);
            } catch (repError) {
                console.error('Replicate failed:', repError.message);
                if (STABILITY_API_KEY) {
                    console.log('Falling back to Stability AI...');
                } else {
                    return res.status(500).json({ message: `Replicate Error: ${repError.message}` });
                }
            }
        }

        // ============================
        // FALLBACK: STABILITY AI
        // ============================
        if (STABILITY_API_KEY) {
            const result = await generateWithStability(imageBase64, prompt, negative_prompt, STABILITY_API_KEY);
            res.setHeader('Content-Type', 'image/png');
            return res.send(result);
        }

    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// ====================================
// REPLICATE - face-to-sticker (InstantID + IP Adapter)
// Giữ nét mặt cực tốt - công nghệ chuyên biệt
// ====================================
async function generateWithReplicate(imageBase64, prompt, negative_prompt, apiToken) {
    const dataUri = `data:image/png;base64,${imageBase64}`;

    const createResponse = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiToken}`,
            "Content-Type": "application/json",
            "Prefer": "wait"
        },
        body: JSON.stringify({
            version: "764d4827ea159608571b1571571f7044dc3b7fcec340e6ba69c14e7720881ff8",
            input: {
                image: dataUri,
                prompt: prompt || "a person",
                negative_prompt: negative_prompt || "",
                steps: 20,
                width: 1024,
                height: 1024,
                prompt_strength: 4.5,
                instant_id_strength: 0.7,
                ip_adapter_weight: 0.2,
                ip_adapter_noise: 0.5,
                upscale: false
            }
        })
    });

    if (!createResponse.ok) {
        const errText = await createResponse.text();
        throw new Error(`${createResponse.status}: ${errText.substring(0, 200)}`);
    }

    let prediction = await createResponse.json();

    // Polling nếu "Prefer: wait" chưa xong
    if (prediction.status !== "succeeded") {
        for (let i = 0; i < 60; i++) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const pollResponse = await fetch(prediction.urls.get, {
                headers: {
                    "Authorization": `Bearer ${apiToken}`,
                    "Content-Type": "application/json"
                }
            });
            if (!pollResponse.ok) throw new Error('Poll failed');
            prediction = await pollResponse.json();
            if (prediction.status === "succeeded") break;
            if (prediction.status === "failed" || prediction.status === "canceled") {
                throw new Error(prediction.error || 'Generation failed');
            }
        }
        if (prediction.status !== "succeeded") throw new Error('Timed out');
    }

    const outputUrl = Array.isArray(prediction.output)
        ? prediction.output[prediction.output.length - 1]
        : prediction.output;

    if (!outputUrl) throw new Error('No output');

    const imageResponse = await fetch(outputUrl);
    if (!imageResponse.ok) throw new Error('Download failed');

    const arrayBuffer = await imageResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

// ====================================
// STABILITY AI - Image-to-Image (fallback)
// ====================================
async function generateWithStability(imageBase64, prompt, negative_prompt, apiKey) {
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: 'image/png' });

    formData.append("image", blob, 'image.png');
    formData.append("prompt", prompt);
    formData.append("strength", "0.15");
    formData.append("mode", "image-to-image");
    formData.append("output_format", "png");
    if (negative_prompt) formData.append("negative_prompt", negative_prompt);

    const response = await fetch("https://api.stability.ai/v2beta/stable-image/generate/core", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Accept": "image/*"
        },
        body: formData
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`${response.status}: ${errText.substring(0, 200)}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
