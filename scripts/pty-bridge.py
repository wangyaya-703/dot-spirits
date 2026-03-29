#!/usr/bin/env python3
import errno
import fcntl
import os
import pty
import signal
import struct
import sys
import termios


def set_winsize(fd: int, rows: int, cols: int) -> None:
    if rows <= 0 or cols <= 0:
        return
    payload = struct.pack('HHHH', rows, cols, 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, payload)


def main() -> int:
    if len(sys.argv) < 2:
        print('usage: pty-bridge.py <command> [args...]', file=sys.stderr)
        return 2

    argv = sys.argv[1:]
    pid, master_fd = pty.fork()
    if pid == 0:
        try:
            os.execvpe(argv[0], argv, os.environ)
        except FileNotFoundError:
            print(f'pty-bridge: command not found: {argv[0]}', file=sys.stderr)
        except Exception as error:  # pragma: no cover - best effort child failure path
            print(f'pty-bridge: failed to exec {argv[0]}: {error}', file=sys.stderr)
        os._exit(127)

    try:
        cols = int(os.environ.get('DOT_CODEX_PTY_COLS', '0'))
        rows = int(os.environ.get('DOT_CODEX_PTY_ROWS', '0'))
        set_winsize(master_fd, rows, cols)
    except Exception:
        pass

    def forward_signal(signum, _frame):
        try:
            os.kill(pid, signum)
        except ProcessLookupError:
            pass

    signal.signal(signal.SIGINT, forward_signal)
    signal.signal(signal.SIGTERM, forward_signal)

    stdin_fd = sys.stdin.fileno()
    stdout_fd = sys.stdout.fileno()
    stdin_open = True

    while True:
        read_fds = [master_fd]
        if stdin_open:
            read_fds.append(stdin_fd)

        try:
            ready, _, _ = select_select(read_fds)
        except InterruptedError:
            continue

        if master_fd in ready:
            try:
                chunk = os.read(master_fd, 4096)
            except OSError as error:
                if error.errno == errno.EIO:
                    break
                raise
            if not chunk:
                break
            os.write(stdout_fd, chunk)

        if stdin_open and stdin_fd in ready:
            chunk = os.read(stdin_fd, 4096)
            if not chunk:
                stdin_open = False
            else:
                os.write(master_fd, chunk)

    _, status = os.waitpid(pid, 0)
    if os.WIFEXITED(status):
        return os.WEXITSTATUS(status)
    if os.WIFSIGNALED(status):
        return 128 + os.WTERMSIG(status)
    return 1


def select_select(read_fds):
    import select

    return select.select(read_fds, [], [])


if __name__ == '__main__':
    raise SystemExit(main())
