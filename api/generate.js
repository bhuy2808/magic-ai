// Dual API: Replicate face-to-sticker (ưu tiên) + Stability AI (fallback)
// Ảnh đã được resize trên frontend (512px, JPEG 60%) → data URI < 500KB → OK

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const { prompt, imageBase64, negative_prompt } = req.body;
        const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
        const STABILITY_API_KEY = process.env.STABILITY_API_KEY;

        if (!REPLICATE_API_TOKEN && !STABILITY_API_KEY) {
            return res.status(500).json({ message: 'No API key configured. Set REPLICATE_API_TOKEN in Vercel.' });
        }

        if (!imageBase64) {
            return res.status(400).json({ message: 'Missing imageBase64' });
        }

        console.log('Image base64 length:', imageBase64.length, 'chars (~' + Math.round(imageBase64.length * 0.75 / 1024) + 'KB)');

        // ƯU TIÊN 1: REPLICATE
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
                    return res.status(500).json({ message: repError.message });
                }
            }
        }

        // FALLBACK: STABILITY AI
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
// REPLICATE face-to-sticker
// Dùng data URI trực tiếp (ảnh đã resize < 1MB trên frontend)
// ====================================
async function generateWithReplicate(imageBase64, prompt, negative_prompt, apiToken) {
    // Ảnh đã được frontend resize xuống 512px + JPEG 60% → < 500KB
    const dataUri = 'data:image/jpeg;base64,' + imageBase64;
    console.log('Data URI length:', dataUri.length, 'chars');

    // Dùng endpoint chuẩn /v1/predictions
    const body = {
        version: "764d4827ea159608a07cdde8ddf1c6000019627515eb02b6b449695fd547e5ef",
        input: {
            image: dataUri,
            prompt: prompt || "a person",
            steps: 25,
            width: 1024,
            height: 1024,
            prompt_strength: 7.5,
            instant_id_strength: 0.7,
            ip_adapter_weight: 0.35,
            ip_adapter_noise: 0.5,
            upscale: true
        }
    };

    if (negative_prompt) {
        body.input.negative_prompt = negative_prompt;
    }

    console.log('Calling Replicate with prompt:', prompt);

    const createRes = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + apiToken,
            "Content-Type": "application/json",
            "Prefer": "wait"
        },
        body: JSON.stringify(body)
    });

    if (!createRes.ok) {
        const errBody = await createRes.text();
        console.error('Replicate error:', createRes.status, errBody);
        throw new Error('Replicate ' + createRes.status + ': ' + errBody.substring(0, 300));
    }

    let prediction = await createRes.json();
    console.log('Prediction status:', prediction.status, 'id:', prediction.id);

    // Polling nếu chưa xong
    if (prediction.status !== "succeeded") {
        for (let i = 0; i < 90; i++) {
            await new Promise(function(r) { setTimeout(r, 2000); });
            const pollRes = await fetch(prediction.urls.get, {
                headers: { "Authorization": "Bearer " + apiToken }
            });
            if (!pollRes.ok) throw new Error('Poll failed');
            prediction = await pollRes.json();
            console.log('Poll #' + (i+1) + ': ' + prediction.status);
            if (prediction.status === "succeeded") break;
            if (prediction.status === "failed" || prediction.status === "canceled") {
                throw new Error(prediction.error || 'Generation failed');
            }
        }
        if (prediction.status !== "succeeded") throw new Error('Timed out');
    }

    // Lấy ảnh kết quả
    const outputUrl = Array.isArray(prediction.output)
        ? prediction.output[prediction.output.length - 1]
        : prediction.output;

    if (!outputUrl) throw new Error('No output image');

    const imgRes = await fetch(outputUrl);
    if (!imgRes.ok) throw new Error('Download failed');

    return Buffer.from(await imgRes.arrayBuffer());
}

// ====================================
// STABILITY AI (fallback)
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
            "Authorization": "Bearer " + apiKey,
            "Accept": "image/*"
        },
        body: formData
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(response.status + ': ' + errText.substring(0, 200));
    }

    return Buffer.from(await response.arrayBuffer());
}
