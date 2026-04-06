const Replicate = require("replicate");

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { imageBase64, prompt, negative_prompt, style } = req.body;

    if (!imageBase64 || !prompt) {
      return res.status(400).json({ error: "Missing imageBase64 or prompt" });
    }

    const apiToken = process.env.REPLICATE_API_TOKEN;
    if (!apiToken) {
      return res.status(500).json({ error: "REPLICATE_API_TOKEN not configured" });
    }

    // Convert base64 to data URI for Replicate
    const imageDataUri = `data:image/jpeg;base64,${imageBase64}`;

    // Gọi trực tiếp API Endpoint /v1/predictions với Version ID
    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Token ${apiToken}`
      },
      body: JSON.stringify({
        version: "a416f413cbf2a828b1085b318e76869e0a66817c1829bb539afc397b0a3111fc",
        input: {
          image: imageDataUri,
          prompt: prompt,
          negative_prompt: negative_prompt || "(big messy hair:1.5), deformed, blurry, realistic, human skin, ugly, bad anatomy, bad background, messy background",
          style: style || "3D",
          instant_id_strength: 0.5,
          denoising_strength: 0.7
        }
      })
    });

    const prediction = await response.json();

    if (!response.ok) {
      console.error("Replicate API Error:", prediction);
      return res.status(response.status).json({ error: prediction.detail || "Error from Replicate API" });
    }

    return res.status(200).json({
      predictionId: prediction.id,
      status: prediction.status
    });

  } catch (err) {
    console.error("Generate API Error:", err);

    if (err.response && err.response.status === 429) {
      return res.status(429).json({ error: "Rate limited. Please wait and try again." });
    }

    return res.status(500).json({
      error: err.message || "Internal server error"
    });
  }
};
