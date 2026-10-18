---
type: Concept
title: Barnes–Hut
description: Use a far node's centre of mass instead of its bodies: O(N log N), with an error set by θ.
---

Build [the quadtree](/algorithms/the-quadtree.md "requires"). For each body, walk the tree from the root. At each node, with $s$ its side and $d$ the distance to its [centre of mass](/algorithms/centre-of-mass.md "requires"):

- if $s/d < \theta$, the node is far enough: add its pull as one body, and stop;
- otherwise open it, and visit its children.

With $\theta = 0$ every node is opened and it is [direct summation](/algorithms/direct-summation.md "see also"), done slowly. The usual choice is $\theta = 0.5$ to $0.7$.

TODO: how big an error does θ = 0.5 give, and why does the cost grow only as N log N?
