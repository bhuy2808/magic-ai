export default async function handler(req, res) {
  // 1. Cấu hình Headers (Rất quan trọng)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { imageBase64, prompt } = req.body;
    const apiToken = process.env.REPLICATE_API_TOKEN;

    // 2. Gọi Replicate
    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: "a07f252abbbd832009640b27f063ea52d87d7a23a185ca165bec23b5adc8deaf",
        input: {
          image: `data:image/jpeg;base64,${imageBase64}`,
          prompt: prompt || "a smiling person, 3d cartoon style, sticker",
          style: req.body.style && ["3D", "Clay", "Video game", "Emoji", "Toy", "Pixel art"].includes(req.body.style) ? req.body.style : "Clay",
          instant_id_strength: 0.65
        }
      })
    });

    // 3. ĐỢI PHẢN HỒI (Bước này quyết định sống còn)
    const prediction = await response.json();
    
    if (!response.ok) {
      console.error("Replicate Error Details:", prediction);
      return res.status(response.status).json({ error: prediction.detail || "Replicate rejected request" });
    }

    // Trả về ID để Frontend bắt đầu Polling (vòng lặp chờ ảnh)
    return res.status(200).json(prediction);

  } catch (error) {
    console.error("API Route Error:", error);
    return res.status(500).json({ error: "Lỗi Server: " + error.message });
  }
}