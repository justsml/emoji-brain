import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import fs from "fs";
import path from "path";
import dedent from "dedent";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

export const emojiLabeler = async (inputImage: string) => {
  const mimeType = path.extname(inputImage).slice(1);
  const validMimeTypes = ["png", "jpg", "jpeg", "gif", "pdf"];
  if (inputImage.endsWith(".webp")) {
    return {};
    // throw new Error("WebP format is not supported. Please convert to PNG, JPG, JPEG, GIF, or PDF.");
  }
  if (!validMimeTypes.includes(mimeType)) {
    throw new Error(
      `Invalid file type: ${mimeType}. Supported types are: ${validMimeTypes.join(
        ", "
      )}`
    );
  }

  return await generateText({
    model: google("gemini-1.5-flash"),
    messages: [
      {
        role: "system",
        // content: dedent`You are an emoji labeler. Your task is to analyze the attached emoji image and provide relevant labelling. The format should be a
        // JSON object with the following keys: 'categories' (an array of strings) and 'tags' (an array of strings), 'author' if known, and 'copyright' if found.
        // The labels should be relevant to the emoji content. For example, if the emoji is a cat, the categories
        // could include 'animal' and/or 'pet', and the tags might include labels like 'dance', 'sunglasses', 'cool', 'busy', 'business', 'animated', etc.
        // ONLY RETURN THE JSON OBJECT WITHOUT ANY ADDITIONAL TEXT OR EXPLANATION.`,
        content: dedent`
          You are an image labeling assistant. Your task is to analyze the provided image and generate a JSON object containing the labels for the image.
          The JSON object should include the following keys: 'categories' (an array of strings) and 'tags' (an array of strings).
          The 'categories' should represent the main themes or subjects of the image, while the 'tags' should include specific details or attributes related to the image.
          If the image is an emoji, the categories could include 'emoji', 'icon', or 'symbol', and the tags might include labels like 'dance', 'sunglasses', 'cool', 'busy', 'business', 'animated', etc.
          The labels should include categories and tags that describe the content of the image. 
          Please ensure that the JSON object is well-structured and valid.
          If you cannot identify any labels, please return an empty JSON object {}.
        `,
      },
      {
        role: "user",
        content: [
          {
            type: "image",
            image: fs.readFileSync(inputImage).toString("base64url"),
            // data: fs.readFileSync(inputImage, 'base64url'),
            // mimeType: `image/${mimeType}`,
          },
        ],
      },
    ],
  });
};
