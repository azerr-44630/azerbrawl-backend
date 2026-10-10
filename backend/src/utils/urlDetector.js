const URL_REGEX =
  /\b((https?:\/\/)|(www\.))[^\s]+|\b[a-z0-9-]+\.(com|net|org|az|ru|tr|io|me|tv|info|xyz|club|site|online)\b/gi;

export const containsLink = (text) => URL_REGEX.test(String(text));
