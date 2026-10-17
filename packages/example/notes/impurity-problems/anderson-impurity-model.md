---
type: Concept
title: Anderson impurity model
description: One interacting orbital coupled to a sea of free electrons.
---

One site with a Hubbard repulsion, hybridised with a bath of non-interacting electrons:

$$
H = \sum_{k\sigma} \epsilon_k\, a^\dagger_{k\sigma} a_{k\sigma} + \sum_{k\sigma} V_k \left( a^\dagger_{k\sigma} d_\sigma + \text{h.c.} \right) + \varepsilon_d \sum_\sigma n_{d\sigma} + U n_{d\uparrow} n_{d\downarrow}
$$

Written in [second quantisation](/many-body-basics/second-quantisation.md "requires"); what we want from it is the impurity's [Green's function](/many-body-basics/greens-function.md "requires").

Anderson wrote it for magnetic impurities in metals (1961). The local moment is screened by the bath below the Kondo temperature: the Kondo effect.

For DMFT what matters: the bath enters only through one function of frequency, the hybridisation function.
