#!/usr/bin/env python
import gtk, glib, sys, fcntl, os
import gobject

import indicate

class MessagingServer:
  def __init__(self, subtype, desktop):
    self.indicators = {}
    self.actions = {}
    self.user_cb = None
    self.server_cb = None
    self.desktop = desktop

    self.srv = indicate.indicate_server_ref_default()
    type = "message.%s" % subtype
    self.srv.set_type(type)
    self.srv.set_desktop_file(desktop)
    self.srv.show()

  def show_indicator(self, name, count, draw_attention=True):
    # update existing indicator, or create new one
    try:
      ind = self.indicators[name]
    except KeyError:
      print "NEW"
      ind = indicate.Indicator()
      self.indicators[name] = ind

    ind.set_property('name', name)
    ind.set_property('count', str(count))
    ind.set_property('draw-attention', 'true' if draw_attention else 'false')
    ind.connect('user-display', self.cb_user_display)

    # hide and reshow actions to keep them at top of list
    for a in self.actions.values():
      a.hide()
    ind.show()
    for a in self.actions.values():
      a.show()

    return ind

  def hide_indicator(self, name):
    try:
      self.indicators[name].hide()
      del(self.indicators[name])
    except KeyError:
      print "ERROR: No indicator named '%s' to hide" % name

  def add_action(self, name, cb):
    ind = indicate.Indicator()
    self.actions[name] = ind
    ind.set_property('name', name)
    ind.set_property('subtype', 'menu')
    ind.connect('user-display', cb)
    ind.show()
    return ind

  def set_user_cb(self, cb):
    self.user_cb = cb

  def set_server_cb(self, cb):
    self.server_cb = cb

  def cb_server_display(self, srv, id):
    print "SERVER DISPLAY"
    if (self.server_cb):
      self.server_cb(self)

  def cb_user_display(self, ind, id):
    print "USER DISPLAY"
    if (self.user_cb):
      self.user_cb(ind.get_property('name'), ind.get_property('count'))
    ind.hide()

def set_nonblock(fd, nonblock):
  fl = fcntl.fcntl(fd, fcntl.F_GETFL)
  if nonblock:
    fl |= os.O_NONBLOCK
  else:
    fl &= ~os.O_NONBLOCK
  fcntl.fcntl(fd, fcntl.F_SETFL, fl)

def user_display(name, count):
  os.system("thunderbird -mail&")

def server_display(srv):
  os.system("thunderbird -mail&")

def io_cb(f, condition, srv):
  commands = {
      'show': [srv.show_indicator, 2],
      'hide': [srv.hide_indicator, 1],
      'exit': [exit, 0]
    }

  if condition == glib.IO_IN:
    data = f.read().strip()
    args = data.strip().split("::")
    cmd = args.pop(0)

    try:
      fn, numargs = commands[cmd]
    except KeyError:
      print "ERROR: command '%s' not known" % cmd
      return True

    if numargs != len(args):
      print "ERROR: '%s' command takes %d arguments but were %d given" % (cmd,
          numargs, len(args))
      return True

    print "CMD: %s" % cmd
    if fn:
      fn(*args)

  else:
    print "ERROR: I/O Error"
    exit()
  return True

if __name__ == "__main__":
  def action_compose(indicator, id):
    os.system("thunderbird -compose&")

  def action_addressbook(indicator, id):
    os.system("thunderbird -addressbook&")

  def timeout(srv):
    srv.add_action("Contacts", action_addressbook)
    srv.add_action("Compose New Message", action_compose)

  srv = MessagingServer('email', '/usr/share/applications/thunderbird.desktop')
  srv.set_user_cb(user_display)
  srv.set_server_cb(server_display)

  fifopath = sys.argv[1]
  #fifopath = "/tmp/thunderbird-indicator-fifo"
  if not os.path.exists(fifopath):
    os.mkfifo(fifopath)

  if len(sys.argv) > 2 and sys.argv[2] == 'mkfifoonly':
    exit()

  fdr = os.open(fifopath, os.O_RDONLY | os.O_NONBLOCK)
  fdw = os.open(fifopath, os.O_WRONLY | os.O_NONBLOCK)
  f = os.fdopen(fdr)
  glib.io_add_watch(f, glib.IO_IN | glib.IO_ERR, io_cb, srv)

  gobject.timeout_add_seconds(0, timeout, srv)
  gtk.main()
