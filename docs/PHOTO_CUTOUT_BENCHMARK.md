# Photo Studio cutout benchmark

November 9, 2026. Round 25 of the image-to-3D loop.

The Photo Studio builds a mesh from the outlines of two photos, so the mesh is
only as good as the cutout. Round 16 measured the gap: with the publisher's
masks the two-photo mesh scored about 0.72 at unseen angles, and with the
automatic cutout 0.53 to 0.60. This round replaces the automatic cutout and
adds a closer second look when the subject is small in the photo.

## Result

15 YCB turntable photographs of three objects (cracker box, mug, power drill).
"Cutout" is overlap with the publisher's mask over five angles. "Unseen angles"
is the mesh carved from the 0° and 90° cutouts, scored at 21° and 69°.

| Photo | Measure | Shipped | New cutout | New cutout, closer look |
|---|---|---:|---:|---:|
| Framed on the object | Cutout | 0.779 | 0.887 | 0.888 |
| Framed on the object | Unseen angles | 0.525 | 0.710 | 0.711 |
| Whole photo, rig in view | Cutout | 0.685 | 0.889 | 0.881 |
| Whole photo, rig in view | Unseen angles | 0.603 | 0.719 | 0.766 |

The shipped column reproduces round 16 exactly (0.5252 and 0.6033).

Unseen-angle score per object, shipped to new with the closer look:

| Object | Framed on the object | Whole photo |
|---|---|---|
| Cracker box | 0.629 to 0.759 | 0.662 to 0.823 |
| Mug | 0.570 to 0.549 | 0.623 to 0.641 |
| Power drill | 0.376 to 0.824 | 0.525 to 0.833 |

The mug loses two points when framed on the object. Its cutout improved
(0.864 to 0.880), and with the publisher's own masks the mug only reaches
0.595, so this object is limited by the two-photo carve, not the cutout.

On the 280 generated scenes that SRL Labs 001 held back from fitting, mean
cutout overlap with mask choice went from 0.8435 to 0.8506. Twelve scenes
improved by more than 0.05 and one got worse (challenge-063, 0.80 to 0.15,
where the mask-choice model no longer switches to the lower threshold).

## What changed

`features/photo-studio/isolation.mjs` still learns the backdrop from the frame
edge. Four stages handle the ways real photos break that:

| Stage | What it does | Without it |
|---|---|---|
| `support` | A colour must cover 4% of the frame edge to count as backdrop, unless it is close to one that does. Clutter crossing the edge no longer teaches the cutout that black is backdrop. | Framed cutout 0.887 to 0.731 |
| `flood` | Follows rare edge colours inward and drops what they reach. | Whole-photo cutout 0.889 to 0.490; the mug is lost and the drill mesh fails |
| `open` | Shrinks the subject by one pixel and drops crumbs that fall off, such as a checkerboard touching it at corners. | Unseen angles 0.710 to 0.692 framed, 0.719 to 0.652 whole |
| `holes` | Fills enclosed specks under 0.5% of the subject. | Framed cutout 0.887 to 0.883 |

`features/photo-studio/frame.mjs` returns a closer crop when the subject spans
less than 60% of the preview. The studio cuts the subject out again from that
crop of the original photo.

The mug builder keeps the first cutout in `isolation-classic.mjs`. Its bundle
is byte-identical to a build of `main`, so its Blender-verified meshes are
unchanged.

## What was tried and dropped

- **Shadow removal.** Treating "backdrop hue, up to 40% darker" as backdrop
  raised the framed cutout score, and erased grey objects on white backdrops
  and low-contrast subjects in the generated scenes. A version that only
  removed shading with no edge was safe and measured nothing. Removed.
- **Filling larger enclosed gaps.** A white label and a mug handle look the
  same by colour. Every rule that filled the cracker box's labels also filled
  the handle. Only specks are filled.
- **Retraining the mask-choice model** on the new cutout gave the same mean on
  the challenge and test scenes (0.8575 both ways). The shipped weights stay.

## Limits

- Stage settings were chosen while looking at these 15 photographs. The
  generated scenes are an independent check on regressions, not on the gain.
  A blind confirmation needs YCB objects this round never saw.
- One studio, one backdrop. No outdoor, handheld or patterned-backdrop photos.
- People are not covered. A person cropped by the frame edge has their
  clothing learned as backdrop, as before.
- Labels the colour of the backdrop still open holes in the cutout. The
  touch-up brush is the fix today.
- Whole-photo scores depend on how the 4272-pixel photo is downsampled: a
  different resize path moved the shipped baseline from 0.603 to 0.593.

## Reproduce

Fetch the photographs and masks as round 16 did (its `fetch.py` and
`prepare-reference.py`), then:

```sh
node scripts/evaluate-foreground.mjs /tmp/yiiya-r16-ycb --out report.json --sheet cutouts.png
```

The script reads the shipped cutout and its weights from `origin/main` with
git, so the comparison does not depend on files kept beside it.
