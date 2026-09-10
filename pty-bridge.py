#!/usr/bin/env python3
"""PTY bridge: stdin/stdout <-> PTY master. Node.js pipes data through this process.
Uses rish (Shizuku) if available for elevated privileges."""
import os, sys, pty, select, struct, fcntl, termios, re

RISH_BIN = '/data/data/com.termux/files/usr/bin/rish'

def set_winsize(fd, cols, rows):
    winsize = struct.pack('HHHH', rows, cols, 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)

def rish_available():
    return os.path.exists(RISH_BIN) and os.path.getsize(RISH_BIN) > 50

def main():
    cols = int(os.environ.get('COLUMNS', '80'))
    rows = int(os.environ.get('LINES', '24'))
    shell = os.environ.get('SHELL', '/data/data/com.termux/files/usr/bin/bash')

    use_rish = rish_available()

    master_fd, slave_fd = pty.openpty()
    set_winsize(master_fd, cols, rows)

    pid = os.fork()
    if pid == 0:
        os.close(master_fd)
        os.setsid()
        fcntl.ioctl(slave_fd, termios.TIOCSCTTY, 0)
        os.dup2(slave_fd, 0)
        os.dup2(slave_fd, 1)
        os.dup2(slave_fd, 2)
        if slave_fd > 2:
            os.close(slave_fd)
        env = os.environ.copy()
        env['TERM'] = 'xterm-256color'
        env['COLORTERM'] = 'truecolor'
        env['COLUMNS'] = str(cols)
        env['LINES'] = str(rows)
        if use_rish:
            os.execvpe(RISH_BIN, [RISH_BIN], env)
        else:
            os.execvpe(shell, [shell, '--login'], env)
    else:
        os.close(slave_fd)
        stdin_fd = sys.stdin.fileno()
        stdout_fd = sys.stdout.fileno()
        sys.stdout = os.fdopen(stdout_fd, 'wb', 0)

        resize_re = re.compile(rb'\x1b\[8;(\d+);(\d+)t')
        input_buf = b''

        while True:
            rlist, _, _ = select.select([master_fd, stdin_fd], [], [], 0.1)
            if master_fd in rlist:
                try:
                    data = os.read(master_fd, 65536)
                    if not data:
                        break
                    os.write(stdout_fd, data)
                except OSError:
                    break
            if stdin_fd in rlist:
                try:
                    data = os.read(stdin_fd, 65536)
                    if not data:
                        break
                    input_buf += data
                    while input_buf:
                        m = resize_re.search(input_buf)
                        if m:
                            before = input_buf[:m.start()]
                            if before:
                                os.write(master_fd, before)
                            r = int(m.group(1))
                            c = int(m.group(2))
                            set_winsize(master_fd, c, r)
                            input_buf = input_buf[m.end():]
                        else:
                            if b'\x1b[8;' in input_buf:
                                break
                            os.write(master_fd, input_buf)
                            input_buf = b''
                except OSError:
                    break

        os.close(master_fd)
        try:
            os.waitpid(pid, 0)
        except ChildProcessError:
            pass

if __name__ == '__main__':
    main()
