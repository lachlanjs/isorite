---
type: Concept
title: Green's function
description: The amplitude for an electron added at one place and time to be found at another.
---

The single-particle Green's function asks: put an electron in at $j$ at time $0$, what is the amplitude to take it out at $i$ at time $t$? With [second quantisation](/many-body-basics/second-quantisation.md "requires"),

$$
G_{ij}(t) = -i\,\theta(t)\,\langle \{ c_i(t), c^\dagger_j(0) \} \rangle
$$

(the retarded one; the time-ordered one differs only in how it treats $t<0$).

Why it matters: everything one-electron about the system is in it. Its poles are the energies at which an electron can be added or removed, and their residues say how much of a real particle each one is.

For non-interacting electrons with energies $\varepsilon_k$, $G_0(k,\omega) = 1/(\omega + i0^+ - \varepsilon_k)$. Interactions move and broaden those poles.
