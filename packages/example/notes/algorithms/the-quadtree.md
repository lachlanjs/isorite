---
type: Concept
title: The quadtree
description: The plane split into squares, and each square into four, until each holds at most one body.
---

A tree over the bodies in 2D. The root is a square holding them all; a square with more than one body is split into four. Each node also keeps its [centre of mass](/algorithms/centre-of-mass.md "requires"). In 3D it is an octree, with eight children.

How is a body inserted, and what does each node keep? I don't have this straight yet.
