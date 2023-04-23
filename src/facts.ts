import { readFile } from 'fs/promises';

// Sample facts collection based on input to enrich AI contextual knowledge
// This can be a locally stored database or a remote API call
// Quering a vertor database could drammatically improve the quality of the answers
// Keep facts size within a tokens limit to avoid OpenAI API errors
// The larger the facts size the more expensive the API call
export const getFacts = async (text: string): Promise<string> => {
  // Be sure to verify that the input is safe and doesn't expose any sensitive data
  // Only route queries to trusted sources as technically a user can ask anything

  console.log(text);

  const t = text.toLowerCase();

  // A basic knowledge base from a file
  if (t.includes('food') || t.includes('eat') || t.includes('cuisine')) {
    return readFile('./kb/marseoni.txt', 'utf8');
  }

  // Send here a request to your knowladge base
  // Return compact facts in a single string, `\n` separated lines
  // OpenAI API will tokenize the facts and add them to the context
  // The more facts the better the AI will be able to answer
  // The more facts the more expensive the API call

  return '';
};
