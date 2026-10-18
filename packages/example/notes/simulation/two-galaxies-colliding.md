---
type: Concept
title: Two galaxies colliding
description: "The goal: two Plummer spheres on a close pass, with tidal tails, at N = 5000."
---

Two [Plummer spheres](/simulation/initial-conditions.md "requires") of 1000 bodies each, set on a parabolic approach and stepped with [the main loop](/simulation/the-main-loop.md "requires"). After the first pass, long tails of stars are pulled out of each: the tidal tails that are seen in the sky.

At $N = 2000$ direct summation is slow but bearable. The tails are thin at that resolution, and $N = 5000$ is where it starts to look right, but there direct summation takes too long for an evening's run. That is what [Barnes–Hut](/algorithms/barnes-hut.md "uses") is for.
