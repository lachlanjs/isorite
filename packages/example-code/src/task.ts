// The one shape every other module agrees on: a task, and nothing else about it.

export interface Task {
  done: boolean;
  text: string;
  // Tags are written +like-this in the task's line and kept here without the plus.
  tags: string[];
  // A day as YYYY-MM-DD, or null. A string, so it sorts as a date and needs no clock to read.
  due: string | null;
}
