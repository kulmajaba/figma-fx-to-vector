const strings = {
  partialSuccess: 'Converted {{converted}} out of {{available}} supported effects',
  error: 'An error occurred, could not convert effects.',
  noSelection: 'Select one or more layers to convert.',
  noEffects: 'No supported effects found in selection.'
};

const CONTROL_STATEMENT_REGEX = /\{\{\s*([\w\d-_]+)\s?\}\}/g;

const t = (key: keyof typeof strings, args?: Record<string, string | number>) => {
  const str = strings[key];
  const valuePlaces = str.matchAll(CONTROL_STATEMENT_REGEX);

  if (!args && str.search(CONTROL_STATEMENT_REGEX) !== -1) {
    console.warn(`String ${key}: no values were given in args`);
  }

  if (!args) {
    return str;
  }

  let formattedStr = '';
  let previousEndIndex = 0;

  for (const match of valuePlaces) {
    const valueKey = match[1];
    const startIndex = match.index;
    const endIndex = match.index + match[0].length;
    const value = args[valueKey];

    if (value !== undefined) {
      formattedStr += `${str.slice(previousEndIndex, startIndex)}${value}`;
    } else {
      console.warn(`String '${key}': Could not find value for '${valueKey}' in args:`, args);
      formattedStr += str.slice(previousEndIndex, endIndex);
    }

    previousEndIndex = endIndex;
  }

  formattedStr += str.slice(previousEndIndex);

  return formattedStr;
};

export default t;
