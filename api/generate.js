export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { imageBase64, prompt } = req.body;
    // DÙNG BIẾN MÔI TRƯỜNG CHO AN TOÀN (NHỚ CẬP NHẬT TOKEN MỚI TRÊN VERCEL)
    const apiToken = process.env.REPLICATE_API_TOKEN; 

    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // DÙNG ĐÚNG MÃ VERSION TRONG ẢNH HUY CHỤP
        version: "a07f252abbbd832009640b27f063ea52d87d7a23a185ca165bec23b5adc8deaf",
        input: {
          image: `data:image/jpeg;base64,${imageBase64}`,
          prompt: prompt,
          style: "Clay",
          instant_id_strength: 0.8
        }
      })
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "Replicate Error");

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}