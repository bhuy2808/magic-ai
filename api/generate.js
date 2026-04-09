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
    const { imageBase64, prompt } = req.body;

    // Gọi đúng bản chính chủ của ByteDance để tránh lỗi 404
    const output = await replicate.run(
      "bytedance/flux-pulid:8baa7ef2255075b46f4d91cd238c21d31181b3e6a864463f967960bb0112525b", 
      {
        input: {
          main_face_image: `data:image/jpeg;base64,${imageBase64}`,
          prompt: prompt,
          true_cfg_scale: 2.0,
          num_steps: 20
        }
      }
    );

    res.status(200).json(output);
  } catch (error) {
    console.error("Replicate Error:", error);
    res.status(500).json({ error: error.message });
  }
}