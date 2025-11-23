export type MacroStep = {
  find: string;
  replace: string;
  useRegex?: boolean;
  caseSensitive?: boolean;
  interpretEscapes?: boolean;
  note?: string;
};

export type Macro = {
  id: string;
  name: string;
  steps: MacroStep[];
};
