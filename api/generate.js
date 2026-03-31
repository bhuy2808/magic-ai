// Dual API: Replicate face-to-sticker (ưu tiên) + Stability AI (fallback)
// Ảnh đã được resize trên frontend (512px, JPEG 60%) → data URI < 500KB → OK

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const { prompts, prompt, imageBase64, negative_prompt } = req.body;
        const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
        const STABILITY_API_KEY = process.env.STABILITY_API_KEY;

        if (!REPLICATE_API_TOKEN && !STABILITY_API_KEY) {
            return res.status(500).json({ message: 'No API key configured.' });
        }

        if (!imageBase64) {
            return res.status(400).json({ message: 'Missing imageBase64' });
        }

        const inputPrompts = Array.isArray(prompts) ? prompts : [prompt];
        const results = [];

        console.log(`Starting generation for ${inputPrompts.length} stickers...`);

        for (const currentPrompt of inputPrompts) {
            let stickerBuffer = null;

            // ƯU TIÊN 1: REPLICATE
            if (REPLICATE_API_TOKEN) {
                try {
                    stickerBuffer = await generateWithReplicate(imageBase64, currentPrompt, negative_prompt, REPLICATE_API_TOKEN);
                } catch (repError) {
                    console.error('Replicate failed for prompt:', currentPrompt, repError.message);
                    if (!STABILITY_API_KEY) {
                        results.push({ error: repError.message });
                        continue;
                    }
                }
            }

            // FALLBACK: STABILITY AI
            if (!stickerBuffer && STABILITY_API_KEY) {
                try {
                    stickerBuffer = await generateWithStability(imageBase64, currentPrompt, negative_prompt, STABILITY_API_KEY);
                } catch (stabError) {
                    console.error('Stability AI failed for prompt:', currentPrompt, stabError.message);
                    results.push({ error: stabError.message });
                    continue;
                }
            }

            if (stickerBuffer) {
                results.push(stickerBuffer.toString('base64'));
            } else {
                results.push({ error: 'Generation failed' });
            }
        }

        // Return batch results
        if (Array.isArray(prompts)) {
            return res.status(200).json({ images: results });
        } else {
            // Backward compatibility for single prompt
            if (typeof results[0] === 'string') {
                res.setHeader('Content-Type', 'image/png');
                return res.send(Buffer.from(results[0], 'base64'));
            } else {
                return res.status(500).json({ message: results[0]?.error || 'Generation failed' });
            }
        }

    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// ====================================
// REPLICATE PhotoMaker (Digital Art Stylization)
// ====================================
async function generateWithReplicate(imageBase64, prompt, negative_prompt, apiToken) {
    const dataUri = 'data:image/jpeg;base64,' + imageBase64;

    const body = {
        version: "ddfc2b6a23414e300305ab23157f43399b66236317b621e7807218ef86ca61e6",
        input: {
            input_image: dataUri,
            prompt: prompt, // Sẽ có chữ "img" từ frontend gửi qua
            num_steps: 40,
            style_name: "Digital Art",
            num_outputs: 1,
            guidance_scale: 5,
            negative_prompt: negative_prompt || "photorealistic, 3d, realistic, cinematic, bad quality, blurry, messy, extra limbs, deformed, text, watermark",
            style_strength_ratio: 35
        }
    };

    console.log('Calling PhotoMaker (Digital Art) with prompt:', prompt);

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

    // Polling if still processing
    if (prediction.status !== "succeeded") {
        for (let i = 0; i < 90; i++) {
            await new Promise(r => setTimeout(r, 2000));
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
    }

    const outputUrl = Array.isArray(prediction.output)
        ? prediction.output[0]
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
    formData.append("strength", "0.32");
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
