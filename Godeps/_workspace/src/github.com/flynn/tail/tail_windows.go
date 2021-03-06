// +build windows

package tail

import (
	"os"

	"github.com/flynn/flynn/Godeps/_workspace/src/github.com/flynn/tail/winfile"
)

func OpenFile(name string) (file *os.File, err error) {
	return winfile.OpenFile(name, os.O_RDONLY, 0)
}
