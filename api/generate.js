export default async function handler(req, res) {
  // 1. Cấu hình Headers (Để Frontend gọi API không bị lỗi)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { imageBase64, prompt } = req.body; // Nhận ảnh và prompt từ Frontend
    const apiToken = process.env.REPLICATE_API_TOKEN;

    if (!apiToken) {
        return res.status(500).json({ error: "Thiếu REPLICATE_API_TOKEN trong Env" });
    }

    // 2. Gọi Replicate (Dùng model Flux-Schnell chính chủ)
    const response = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: {
          image: `data:image/jpeg;base64,${imageBase64}`,
          prompt: prompt, // Sử dụng prompt biểu cảm lẻ từ vòng lặp index.html gửi lên
          
          // --- THÔNG SỐ QUAN TRỌNG ---
          prompt_strength: 0.65,  // Giữ kính và identity gốc tốt hơn
          num_inference_steps: 4, // Flux Schnell chạy 4 bước là cực nét
          guidance_scale: 15,     // Ép AI tuân thủ expression keywords mạnh hơn
          output_format: "webp",
          aspect_ratio: "1:1"
        }
      })
    });

    const prediction = await response.json();

    if (!response.ok) {
      console.error("Replicate Error:", prediction);
      return res.status(response.status).json({ error: prediction.detail || "Lỗi từ Replicate" });
    }

    // Trả về kết quả cho Frontend
    return res.status(200).json(prediction);

  } catch (error) {
    console.error("API Route Error:", error);
    return res.status(500).json({ error: "Lỗi Server: " + error.message });
  }
}