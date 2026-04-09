export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { imageBase64, prompt } = req.body;
    const apiToken = process.env.REPLICATE_API_TOKEN;

    if (!apiToken) {
      return res.status(500).json({ error: "Thiếu REPLICATE_API_TOKEN trong Env" });
    }

    // Dùng model zsxkib/flux-pulid – hỗ trợ FaceID/Identity Preservation
    const response = await fetch("https://api.replicate.com/v1/models/zsxkib/flux-pulid/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: {
          main_face_image: `data:image/jpeg;base64,${imageBase64}`,
          prompt: prompt,
          true_cfg_scale: 2.0,
          num_steps: 8,
        }
      })
    });

    const prediction = await response.json();

    if (!response.ok) {
      console.error("Replicate Error:", prediction);
      return res.status(response.status).json({ error: prediction.detail || "Lỗi từ Replicate" });
    }

    return res.status(200).json(prediction);

  } catch (error) {
    console.error("API Route Error:", error);
    return res.status(500).json({ error: "Lỗi Server: " + error.message });
  }
}