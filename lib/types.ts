export type PantrySelection = Record<string, boolean>;

export type RecipeIngredient = {
  amount?: string;
  unit?: string;
  item?: string;
  note?: string;
};

export type Recipe = {
  title: string;
  cuisine: string;
  servings: number;
  time: number; // Minuten
  ingredients: (RecipeIngredient | string)[];
  authentic?: string[];
  steps: string[];
  allergyNote?: string | null;
};
