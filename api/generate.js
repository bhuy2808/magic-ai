export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { imageBase64, prompt } = req.body;
    const apiToken = process.env.REPLICATE_API_TOKEN;

    // ĐƯỜNG CHÍNH NGẠCH:
    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // ĐỊA CHỈ NHÀ CHUẨN CỦA FACE-TO-MANY
        version: "a416f413cbf2a828b1085b318e76869e0a66817c1829bb539afc397b0a3111fc",
        input: {
          image: `data:image/jpeg;base64,${imageBase64}`,
          prompt: prompt,
          style: "3D Cartoon",
          instant_id_strength: 0.5,
          denoising_strength: 0.7
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