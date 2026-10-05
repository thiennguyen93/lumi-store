// `pnpm dev` only: text and rich copies with math in them, and what src/math.rs
// finds in each — dumped from the Rust, so the page is drawn from the
// extension's own answers. Dump again after changing math.rs.

import type { MathFound } from "../bridge";

export const MOCK_MATH: Record<string, { text: string; short: string; math: MathFound[]; html?: string }> = {
  "mx1": {
    "math": [
      {
        "answers": [
          {
            "copy": "18",
            "tex": "= 18"
          }
        ],
        "from": 22,
        "short": "= 18",
        "sort": "expression",
        "tex": "1 + 2 + 5 + 10",
        "to": 35
      },
      {
        "answers": [
          {
            "copy": "x = 2",
            "tex": "x_{1} = 2"
          },
          {
            "copy": "x = 3",
            "tex": "x_{2} = 3"
          }
        ],
        "from": 53,
        "note": "Δ = 1",
        "short": "x = 2, 3",
        "sort": "quadratic",
        "tex": "x^{2} - 5x + 6 = 0",
        "to": 65
      }
    ],
    "short": "∑ 2",
    "text": "I have the expression 1+2   +5 + 10 and the equation x^(2)-5x+6=0"
  },
  "mx2": {
    "math": [
      {
        "answers": [
          {
            "copy": "288333.3333",
            "tex": "= 288{,}333.3333"
          },
          {
            "copy": "865000/3",
            "tex": "= \\frac{865000}{3}"
          }
        ],
        "from": 16,
        "short": "= 288,333.3333",
        "sort": "expression",
        "tex": "\\frac{450{,}000 + 320{,}000 + 95{,}000}{3}",
        "to": 45
      },
      {
        "answers": [
          {
            "copy": "86500",
            "tex": "= 86{,}500"
          }
        ],
        "from": 61,
        "short": "= 86,500",
        "sort": "percentage",
        "tex": "10\\%\\ \\text{of}\\ 865{,}000",
        "to": 74
      }
    ],
    "short": "∑ 2",
    "text": "Split the bill: (450000 + 320000 + 95000) / 3 people, plus a 10% of 865000 tip"
  },
  "mx3": {
    "math": [
      {
        "answers": [
          {
            "copy": "x = ±√2",
            "tex": "x = \\pm \\sqrt{2}"
          },
          {
            "copy": "-1.41421",
            "tex": "x_{1} \\approx -1.41421"
          },
          {
            "copy": "1.41421",
            "tex": "x_{2} \\approx 1.41421"
          }
        ],
        "from": 13,
        "note": "Δ = 8",
        "short": "x = ±√2",
        "sort": "quadratic",
        "tex": "x^{2} = 2",
        "to": 20
      },
      {
        "answers": [
          {
            "copy": "x = -1 ± 2i",
            "tex": "x = -1 \\pm 2i"
          }
        ],
        "from": 23,
        "note": "Complex roots · Δ = -16",
        "short": "x = -1 ± 2i",
        "sort": "quadratic",
        "tex": "x^{2} + 2x + 5 = 0",
        "to": 39
      },
      {
        "answers": [
          {
            "copy": "x = 5",
            "tex": "x = 5"
          }
        ],
        "from": 42,
        "short": "x = 5",
        "sort": "linear",
        "tex": "3x + 7 = 22",
        "to": 53
      },
      {
        "from": 56,
        "holds": false,
        "note": "Left 22 · right 23",
        "short": "✕ false",
        "sort": "check",
        "tex": "\\sqrt{16} + 3^{2} \\cdot 2 = 23",
        "to": 73
      }
    ],
    "short": "∑ 4",
    "text": "Harder ones: x^2 = 2 ; x^2 + 2x + 5 = 0 ; 3x + 7 = 22 ; √16 + 3² * 2 = 23"
  },
  "mx4": {
    "math": [
      {
        "answers": [
          {
            "copy": "1.5",
            "tex": "= 1.5"
          },
          {
            "copy": "3/2",
            "tex": "= \\frac{3}{2}"
          }
        ],
        "from": 0,
        "short": "= 1.5",
        "sort": "expression",
        "tex": "\\sin\\left(\\frac{\\pi}{6}\\right) + \\cos\\left(0\\right)",
        "to": 18
      }
    ],
    "short": "= 1.5",
    "text": "sin(pi/6) + cos(0)"
  },
  "mx5": {
    "text": "Invoice total: 12 * 3 + 4, a 15% of 40 discount, and 2x + 1 = 7.",
    "short": "∑ 3",
    "html": "<p>Invoice total: <b>12 * 3</b>+ 4,</p><p>a <i>15%</i> of 40 discount, and <span style=\"color: rgb(220, 38, 38)\">2x + 1 = 7</span>.</p>",
    "math": [
      {
        "answers": [
          {
            "copy": "40",
            "tex": "= 40"
          }
        ],
        "from": 15,
        "short": "= 40",
        "sort": "expression",
        "tex": "12 \\cdot 3 + 4",
        "to": 25
      },
      {
        "answers": [
          {
            "copy": "6",
            "tex": "= 6"
          }
        ],
        "from": 29,
        "short": "= 6",
        "sort": "percentage",
        "tex": "15\\%\\ \\text{of}\\ 40",
        "to": 38
      },
      {
        "answers": [
          {
            "copy": "x = 3",
            "tex": "x = 3"
          }
        ],
        "from": 53,
        "short": "x = 3",
        "sort": "linear",
        "tex": "2x + 1 = 7",
        "to": 63
      }
    ]
  }
};
