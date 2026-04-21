import Replicate from "replicate";

export const config = {
  maxDuration: 60,
};

// Nhớ là token trong Vercel phải thay cái mới nhé!
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN, 
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const { imageBase64, prompt, negativePrompt, promptStrength } = req.body;

    const inputData = {
      main_face_image: `data:image/jpeg;base64,${imageBase64}`,
      prompt: prompt,
      true_cfg: 4.0,
      num_steps: 16
    };

    if (negativePrompt) {
      inputData.negative_prompt = negativePrompt;
    }
    // Quan trọng: Tăng id_weight lên 0.90 để giữ lại độ chi tiết của khuôn mặt (kính, răng, v.v.)
    // Nếu để 0.75 như trước thì AI sẽ vẽ ra một khuôn mặt anime quá chung chung (generic) và làm mất phụ kiện.
    if (promptStrength) {
      inputData.id_weight = parseFloat(promptStrength) || 0.90;
    } else {
      inputData.id_weight = 0.90;
    }

    // Gọi đúng bản chính chủ của ByteDance để tránh lỗi 404
    const output = await replicate.run(
      "bytedance/flux-pulid:8baa7ef2255075b46f4d91cd238c21d31181b3e6a864463f967960bb0112525b", 
      {
        input: inputData
      }
    );

    res.status(200).json(output);
  } catch (error) {
    console.error("Replicate Error:", error);
    res.status(500).json({ error: error.message });
  }
}