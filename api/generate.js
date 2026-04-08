export default async function handler(req, res) {
  // 1. Cấu hình Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { imageBase64 } = req.body;
    const apiToken = process.env.REPLICATE_API_TOKEN;

   // MASTER PROMPT MỚI: Biết tự thích nghi với ảnh gốc
const masterPrompt = "A grid of 6 different professional 3D Pixar-style sticker busts. (CRITICAL: Every sticker must feature the same identity, skin tone, hair style, and specific distinct features as the woman in the reference photo). Each of the 6 stickers MUST have a COMPLETELY DIFFERENT and dramatic facial expression: 1. Laughing loudly, 2. Crying with tears, 3. Pensive/thinking, 4. Blowing a kiss, 5. Extreme anger, 6. Winking. Soft cinematic 3D render, white sticker borders, pastel background, high quality, 8k. Ensure high identity fidelity.";

    // 2. Gọi Replicate (Chuyển sang SDXL cho khôn hơn)
    const response = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: {
          image: `data:image/jpeg;base64,${imageBase64}`,
          prompt: masterPrompt,
          prompt_strength: 0.7, 
          num_inference_steps: 4,
          guidance_scale: 3.5,
          output_format: "webp"
        }
      })
    });

    // 3. ĐỢI PHẢN HỒI
    const prediction = await response.json();

    if (!response.ok) {
      console.error("Replicate Error Details:", prediction);
      return res.status(response.status).json({ error: prediction.detail || "Replicate rejected request" });
    }

    return res.status(200).json(prediction);

  } catch (error) {
    console.error("API Route Error:", error);
    return res.status(500).json({ error: "Lỗi Server: " + error.message });
  }
}