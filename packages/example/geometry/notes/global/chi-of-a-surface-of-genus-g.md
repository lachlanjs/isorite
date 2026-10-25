---
type: Problem
title: "χ of a surface of genus g"
uses: [global/euler]
---

What is $\chi$ for a closed orientable surface of genus $g$?

## Solution

Joining two closed surfaces by cutting a disc out of each and gluing along the circles takes away two faces and adds nothing: $\chi = \chi_1 + \chi_2 - 2$.

A handle is a join with a torus, and $\chi = 0$ for the torus, so each handle lowers $\chi$ by $2$.

Starting from the sphere ($\chi = 2$): $\chi = 2 - 2g$.
