// Where the tutorial is: the part (-1 while the parts are listed), the step within it, the parts done, and whether
// it was left. For the page's life.

export const tour = $state({ part: -1, at: 0, left: false, done: [] as number[] });
