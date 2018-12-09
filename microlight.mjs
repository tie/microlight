/**
 * @fileoverview microlight.mjs - syntax highlightning library
 * @version based on 0.0.7, see package.json and git tags for current version number
 * 
 *
 * @license MIT, see http://github.com/asvd/microlight
 * @copyright 2016 asvd <heliosframework@gmail.com>
 *
 * Modified by Ivan Trubach <mr.trubach@icloud.com>
 * All changes are public domain to the extent allowed by law.
 * For more information, please refer to <https://unlicense.org/>
 */

import { escapeHTML } from './util'

const keywords = /^(a(bstract|lias|nd|rguments|rray|s(m|sert)?|uto)|b(ase|egin|ool(ean)?|reak|yte)|c(ase|atch|har|hecked|lass|lone|ompl|onst|ontinue)|de(bugger|cimal|clare|f(ault|er)?|init|l(egate|ete)?)|do|double|e(cho|ls?if|lse(if)?|nd|nsure|num|vent|x(cept|ec|p(licit|ort)|te(nds|nsion|rn)))|f(allthrough|alse|inal(ly)?|ixed|loat|or(each)?|riend|rom|unc(tion)?)|global|goto|guard|i(f|mp(lements|licit|ort)|n(it|clude(_once)?|line|out|stanceof|t(erface|ernal)?)?|s)|l(ambda|et|ock|ong)|m(icrolight|odule|utable)|NaN|n(amespace|ative|ext|ew|il|ot|ull)|o(bject|perator|r|ut|verride)|p(ackage|arams|rivate|rotected|rotocol|ublic)|r(aise|e(adonly|do|f|gister|peat|quire(_once)?|scue|strict|try|turn))|s(byte|ealed|elf|hort|igned|izeof|tatic|tring|truct|ubscript|uper|ynchronized|witch)|t(emplate|hen|his|hrows?|ransient|rue|ry|ype(alias|def|id|name|of))|u(n(checked|def(ined)?|ion|less|signed|til)|se|sing)|v(ar|irtual|oid|olatile)|w(char_t|hen|here|hile|ith)|xor|yield)$/

// https://en.wikipedia.org/wiki/Alpha_compositing#Alpha_blending
// https://en.wikipedia.org/wiki/Transparency_%28graphic%29#Compositing_calculations

// combine dst (bg) and src (fg) RGBA colors
function blend (dst, src) {
  const out = { r: 0, g: 0, b: 0, a: 1 }
  if (dst.a !== 1) {
    out.a = src.a + dst.a * (1 - src.a)
  }
  if (out.a !== 0) {
    out.r = (src.r * src.a + dst.r * dst.a * (1 - src.a)) / out.a
    out.g = (src.g * src.a + dst.g * dst.a * (1 - src.a)) / out.a
    out.b = (src.b * src.a + dst.b * dst.a * (1 - src.a)) / out.a
  }
  return out
}

function hex (n) {
  return n.toString(16).padStart(2, '0').toUpperCase()
}

// convert RGBA to RGB and return CSS color
function rgba ({ r, g, b, a }) {
  [ r, g, b ] = [ Math.round(r), Math.round(g), Math.round(b) ]
  if (a === 1) {
    return `#${hex(r)}${hex(g)}${hex(b)}`
  }
  a = a.toFixed(2)
  return `rgba(${r},${g},${b},${a})`
}

const opaqueBlack = { r: 0x00, g: 0x00, b: 0x00, a: 1 }
const transparentWhite = { r: 0xFF, g: 0xFF, b: 0xFF, a: 0 }

// highlights source text using HTML spans and style attribute
export default (text, fg = opaqueBlack, bg = transparentWhite) => {
  let output = ''

  let pos = 0 // current position
  let next1 = text[0] // next character
  let chr = -1 // current character
  let prev1 // previous character
  let prev2 // the one before the previous
  let token = '' // current token content

  // current token type:
  //  0: anything else (whitespaces / newlines)
  //  1: operator or brace
  //  2: closing braces (after which '/' is division not regex)
  //  3: (key)word
  //  4: regex
  //  5: string starting with "
  //  6: string starting with '
  //  7: xml comment  <!-- -->
  //  8: multiline comment /* */
  //  9: single-line comment starting with two slashes //
  // 10: single-line comment starting with hash #
  let tokenType = 0

  // kept to determine between regex and division
  let lastTokenType
  // flag determining if token is multi-character
  let multichar = false

  // running through characters and highlighting
  for (;;) {
    prev2 = prev1
    // escaping if needed (with except for comments)
    // pervious character will not be therefore
    // recognized as a token finalize condition
    if (tokenType < 7 && prev1 === '\\') {
      prev1 = -1
    } else if (!chr) {
      break
    } else {
      prev1 = chr
    }
    chr = next1
    next1 = text[++pos]
    multichar = token.length > 1

    const styles = computeStyles(fg, bg)

    // checking if current token should be finalized
    if (!chr || // end of content
            // types 9-10 (single-line comments) end with a
            // newline
            (tokenType > 8 && chr === '\n') ||
            [ // finalize conditions for other token types
              // 0: whitespaces
              /\S/.test(chr), // merged together
              // 1: operators
              1, // consist of a single character
              // 2: braces
              1, // consist of a single character
              // 3: (key)word
              !/[$\w]/.test(chr),
              // 4: regex
              (prev1 === '/' || prev1 === '\n') && multichar,
              // 5: string with "
              prev1 === '"' && multichar,
              // 6: string with '
              prev1 === "'" && multichar,
              // 7: xml comment
              text[pos - 4] + prev2 + prev1 === '-->',
              // 8: multiline comment
              prev2 + prev1 === '*/'
            ][tokenType]
    ) {
      // appending the token to the result
      if (token) {
        // remapping token type into style
        // (some types are highlighted similarly)
        let style = ''
        switch (tokenType) {
          // not formatted
          case 0:
            break
          // punctuation
          case 1:
          case 2:
            style = styles[2]
            break
          // (key)word
          case 3:
            if (keywords.test(token)) {
              style = styles[1]
            } else {
              style = styles[0]
            }
            break
          // regex and strings
          case 4:
          case 5:
          case 6:
            style = styles[3]
            break
          // comments
          case 7:
          case 8:
          case 9:
          case 10:
            style = styles[4]
            break
        }
        const safeToken = escapeHTML(token)
        if (style !== '') {
          output += `<span style="${style}">${safeToken}</span>`
        } else {
          output += safeToken
        }
      }

      // saving the previous token type
      // (skipping whitespaces and comments)
      if (tokenType > 0 && tokenType < 7) {
        lastTokenType = tokenType
      }

      // initializing a new token
      token = ''

      // determining the new token type

      // 10: hash-style comment
      if (chr === '#') {
        tokenType = 10
      } else
      //  9: single-line comment
      if (chr + next1 === '//') {
        tokenType = 9
      } else
      //  8: multiline comment
      if (chr + next1 === '/*') {
        tokenType = 8
      } else
      //  7: xml comment
      if (chr + next1 + text[pos + 1] + text[pos + 2] === '<!--') {
        tokenType = 7
      } else
      //  6: string with '
      if (chr === `'`) {
        tokenType = 6
      } else
      //  5: string with "
      if (chr === `"`) {
        tokenType = 5
      } else
      //  4: regex
      if (chr === '/' &&
                // previous token was an opening brace or an operator (otherwise division, not a regex)
                (lastTokenType < 2) &&
                // workaround for xml closing tags
                prev1 !== '<') {
        tokenType = 4
      } else
      //  3: (key)word
      if (/[$\w]/.test(chr)) {
        tokenType = 3
      } else
      //  2: closing brace
      if (/[\])]/.test(chr)) {
        tokenType = 2
      } else
      //  1: operator or braces
      if (/[/{}[(\-+*=<>:;|\\.,?!&@~]/.test(chr)) {
        tokenType = 1
      } else {
        tokenType = 0
      }
    }

    token += chr
  }
  return output
}

export function computeStyles ({ r, g, b, a }, bg) {
  const colors = {
    keywords: {
      opacity: 1.0,
      color: blend(bg, { r, g, b, a: a * 1.0 }),
      shadow: [
        { r, g, b, a: a * 0.7 * 1.0 },
        { r, g, b, a: a * 0.4 * 1.0 }
      ]
    },
    punctuation: {
      opacity: 0.6,
      color: blend(bg, { r, g, b, a: a * 0.6 }),
      shadow: [
        { r, g, b, a: a * 0.25 * 0.6 },
        { r, g, b, a: a * 0.25 * 0.6 }
      ]
    },
    strings: {
      opacity: 0.7,
      color: blend(bg, { r, g, b, a: a * 0.7 }),
      shadow: [
        { r, g, b, a: a * 0.2 * 0.7 },
        { r, g, b, a: a * 0.2 * 0.7 }
      ]
    },
    comments: {
      opacity: 0.5,
      color: blend(bg, { r, g, b, a: a * 0.5 }),
      shadow: [
        { r, g, b, a: a * 0.25 * 0.5 },
        { r, g, b, a: a * 0.25 * 0.5 }
      ]
    }
  }

  // convert to valid CSS colors
  for (const type in colors) {
    colors[type].color = rgba(colors[type].color)
    const shadows = colors[type].shadow
    for (const index in shadows) {
      shadows[index] = rgba(shadows[index])
    }
  }

  const styles = [
    // 0: not formatted
    '',
    // 1: keywords
    `color: ${colors.keywords.color}; text-shadow: 0px 0px 9px ${colors.keywords.shadow[0]}, 0px 0px 2px ${colors.keywords.shadow[1]}`,
    // 2: punctuation
    `color: ${colors.punctuation.color}; text-shadow: 0px 0px 7px ${colors.punctuation.shadow[0]}, 0px 0px 3px ${colors.punctuation.shadow[1]}`,
    // 3: strings and regexps
    `color: ${colors.strings.color}; text-shadow: 3px 0px 5px ${colors.strings.shadow[0]}, -3px 0px 5px ${colors.strings.shadow[1]}`,
    // 4: comments
    `color: ${colors.comments.color}; text-shadow: 3px 0px 5px ${colors.comments.shadow[0]}, -3px 0px 5px ${colors.comments.shadow[1]}; font-style: italic`
  ]

  return styles
}