knightsData.js (js/game) is GENERATED. Do not edit it by hand.
Regenerate:  py -3 tools/knights/gen_data.py <guidelines.txt> [js/game/knightsData.js]
  gen_data.py   reads the teacher's guidelines document (as text) for scenarios, quotes and conclusions, holds the logical structure of the six
                exercises, and asserts that each has exactly one consistent row equal to the document's key.
  hints_iff.py  the 72 hints, the stage titles and the stage-4 rule, written for the method taught in class (the consistency condition is an
                "if and only if" sentence); stages 3-4 are generated from the structure so every worked example is computed.
