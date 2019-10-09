declare module 'string-similarity' {
  export interface StringSimilarityRating {
    target: string;
    rating: number;
  }

  export interface StringSimilarityMatch {
    bestMatchIndex: number;
    bestMatch: string;
    ratings: StringSimilarityRating[];
  }

  export function compareTwoStrings(first: string, second: string): number;

  export function findBestMatch(
    main: string,
    targets: string[],
  ): StringSimilarityMatch;
}
