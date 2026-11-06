const markerColors = {'+': 'green', '-': 'red', '~': 'yellow', '-/+': 'yellow', '+/-': 'yellow', '#': 'gray-dark'}

// classify returns the line color and the column of its diff marker (where the marker would be if it is blank).
function classify(line) {
    const m = line.match(/^( *)(-\/\+|\+\/-|[-+~#])( |$)/)
    if (m) {
        return {color: markerColors[m[2]], col: m[1].length}
    }
    return {color: 'gray', col: line.search(/\S/) - 2}
}

function heredocBodyColor(line, col, openerColor) {
    if (line[col + 1] === ' ' && '+-~'.includes(line[col])) {
        return markerColors[line[col]]
    }
    return openerColor === 'green' || openerColor === 'red' ? openerColor : 'gray'
}

export default {
    props: ['data'],
    computed: {
        lines() {
            if (!this.data) {
                return [{text: "For some reason, this object does not include textual diff. Please file an issue.", color: 'gray'}]
            }
            const lines = this.data.split('\n')
            const res = []
            for (let i = 0; i < lines.length; i++) {
                const opener = classify(lines[i])
                res.push({text: lines[i], color: opener.color})

                // Terraform indents the closing delimiter two columns past the opener's marker,
                // and per-line markers of the body two columns past the closing delimiter.
                const heredoc = lines[i].match(/<<-?(\w+)$/)
                if (!heredoc || opener.col < 0) {
                    continue
                }
                const closing = ' '.repeat(opener.col + 2) + heredoc[1]
                const end = lines.findIndex((l, j) => j > i && (l === closing || l.startsWith(closing + ' ')))
                if (end < 0) {
                    continue
                }
                for (i++; i < end; i++) {
                    res.push({text: lines[i], color: heredocBodyColor(lines[i], opener.col + 4, opener.color)})
                }
                res.push({text: lines[end], color: opener.color})
            }
            return res
        }
    },
    template: `
        <div style="line-height: 0.9; white-space: pre;" class="hscroll pb-1">
            <template v-for="line in lines">
                <code :class="'color-' + line.color">{{ line.text }}</code>
                <br>
            </template>
        </div>`
}
