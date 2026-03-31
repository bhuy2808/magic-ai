const Replicate = require('replicate');

// Initializing Replicate with environment variable only
const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const { prompts, prompt, imageBase64, negative_prompt } = req.body;
        const STABILITY_API_KEY = process.env.STABILITY_API_KEY;

        // Log token presence (safe check)
        console.log('--- API Token Check ---');
        console.log('REPLICATE_API_TOKEN:', process.env.REPLICATE_API_TOKEN ? 'DETECTED (OK)' : 'MISSING');
        console.log('STABILITY_API_KEY:', STABILITY_API_KEY ? 'DETECTED (OK)' : 'MISSING');

        if (!process.env.REPLICATE_API_TOKEN && !STABILITY_API_KEY) {
            return res.status(500).json({ message: 'No API key configured.' });
        }

        if (!imageBase64) {
            return res.status(400).json({ message: 'Missing imageBase64' });
        }

        // 1. Upload to public host for Replicate
        let publicImageUrl = null;
        try {
            console.log('Uploading input image to tmpfiles.org...');
            publicImageUrl = await uploadToTmpFiles(imageBase64);
            console.log('Public image URL:', publicImageUrl);
        } catch (uploadErr) {
            console.error('Failed to upload to public host:', uploadErr.message);
        }

        const inputPrompts = Array.isArray(prompts) ? prompts : [prompt];
        const results = [];

        console.log(`--- Resilient Loop: Starting generation for ${inputPrompts.length} stickers ---`);

        for (const [index, currentPrompt] of inputPrompts.entries()) {
            console.log(`--- Đang tạo sticker thứ: ${index + 1} / ${inputPrompts.length} ---`);
            console.log(`Prompt: ${currentPrompt}`);
            
            // 2s delay to avoid 429 Throttling
            if (index > 0) {
                console.log('Waiting 2 seconds before next request...');
                await new Promise(r => setTimeout(r, 2000));
            }

            let stickerBuffer = null;

            try {
                // ƯU TIÊN 1: REPLICATE (using official library)
                if (process.env.REPLICATE_API_TOKEN) {
                    try {
                        const inputSource = publicImageUrl || ('data:image/jpeg;base64,' + imageBase64);
                        stickerBuffer = await generateWithReplicate(inputSource, currentPrompt, negative_prompt);
                    } catch (repError) {
                        console.error(`Replicate failed for sticker #${index + 1}:`, repError.message);
                    }
                }

                // FALLBACK: STABILITY AI
                if (!stickerBuffer && STABILITY_API_KEY) {
                    try {
                        stickerBuffer = await generateWithStability(imageBase64, currentPrompt, negative_prompt, STABILITY_API_KEY);
                    } catch (stabError) {
                        console.error(`Stability AI fallback failed for sticker #${index + 1}:`, stabError.message);
                    }
                }

                if (stickerBuffer) {
                    results.push(stickerBuffer.toString('base64'));
                    console.log(`✅ Sticker #${index + 1} completed.`);
                } else {
                    console.warn(`❌ Sticker #${index + 1} failed all methods.`);
                    results.push({ error: 'Generation failed' });
                }

            } catch (innerError) {
                console.error(`Critical error in loop for sticker #${index + 1}:`, innerError.message);
                results.push({ error: innerError.message });
            }
        }

        console.log('--- Batch Generation Finished ---');

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
// UTILS: Public Image Hosting (tmpfiles.org)
// ====================================
async function uploadToTmpFiles(imageBase64) {
    const buffer = Buffer.from(imageBase64, 'base64');
    const formData = new FormData();
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    formData.append('file', blob, 'input_image.jpg');

    const res = await fetch('https://tmpfiles.org/api/v1/upload', {
        method: 'POST',
        body: formData
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Upload failed (${res.status}): ${text}`);
    }

    const json = await res.json();
    const rawUrl = json.data.url.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');
    return rawUrl;
}

// ====================================
// REPLICATE fofr/face-to-sticker
// ====================================
async function generateWithReplicate(imageUrl, prompt, negative_prompt) {
    console.log('Running fofr/face-to-sticker via official client...');
    
    // Using the official library's run method which handles polling automatically
    const output = await replicate.run(
        "fofr/face-to-sticker:764d4827ea159608a07cdde8ddf1c6000019627515eb02b6b449695fd547e5ef",
        {
            input: {
                image: imageUrl,
                prompt: prompt,
                negative_prompt: negative_prompt || "photorealistic, 3d, realistic, cinematic, bad quality, blurry, messy, extra limbs, deformed, text, watermark",
                upscale: true,
                upscale_steps: 20
            }
        }
    );

    const outputUrl = Array.isArray(output) ? output[0] : output;
    if (!outputUrl) throw new Error('No output image URL from Replicate');

    const imgRes = await fetch(outputUrl);
    if (!imgRes.ok) throw new Error('Download from Replicate failed');

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
        throw new Error(`Stability API ${response.status}: ${errText.substring(0, 200)}`);
    }

    return Buffer.from(await response.arrayBuffer());
}
