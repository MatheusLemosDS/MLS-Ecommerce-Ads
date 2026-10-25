"""Configure the new bridge service using hidden local input; no secret output."""
import getpass
import argparse
import fcntl
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import warnings
from urllib import request,error

BRIDGE_SHA='ed0408b611516ff76a711aaac98253b1b3ceabade6bbe635913f8432ab30f9ff'
PROTOCOL='hermes-finance-v1'
UNIT='[Unit]\nDescription=BrazaCommerce Hermes web analysis bridge\nWants=network-online.target\nAfter=network-online.target\n\n[Service]\nType=simple\nUser=hermes-mls\nGroup=1000\nWorkingDirectory=/home/hermes-mls\nEnvironmentFile=/etc/brazacommerce-hermes-bridge.env\nExecStart=/usr/bin/python3 -B /opt/brazacommerce-hermes-bridge/hermes_bridge.py\nRestart=on-failure\nRestartSec=30\nNoNewPrivileges=true\nPrivateTmp=true\nProtectSystem=strict\nProtectHome=read-only\nReadWritePaths=/home/hermes-mls/.hermes\nUMask=0077\n\n[Install]\nWantedBy=multi-user.target\n'

class ActivationError(ValueError):pass
class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):return None

def directory(path,*,anchor='/',owner=0):
    fd=os.open(anchor,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        info=os.fstat(fd)
        if info.st_uid!=owner or info.st_mode&0o022:raise ActivationError('BRIDGE_PATH_INVALID')
        for part in path.strip('/').split('/'):
            child=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
            os.close(fd);fd=child;info=os.fstat(fd)
            if info.st_uid!=owner or info.st_mode&0o022:raise ActivationError('BRIDGE_PATH_INVALID')
        return fd
    except BaseException:os.close(fd);raise

def verify(*,anchor='/',owner=0):
    fd=directory('/opt/brazacommerce-hermes-bridge',anchor=anchor,owner=owner)
    try:
        file=os.open('hermes_bridge.py',os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd)
        with os.fdopen(file,'rb') as stream:
            info=os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_uid!=owner or info.st_mode&0o022 or info.st_nlink!=1 or info.st_size>32768:raise ActivationError('BRIDGE_SOURCE_INVALID')
            raw=stream.read(32769)
        if hashlib.sha256(raw).hexdigest()!=BRIDGE_SHA:raise ActivationError('BRIDGE_SOURCE_INVALID')
    finally:os.close(fd)

def preflight(key,*,drain=None):
    if type(key) is not str or not re.fullmatch(r'[A-Za-z0-9_-]{32,256}',key):raise ActivationError('BRIDGE_KEY_INVALID')
    if drain is not None and type(drain) is not bool:raise ActivationError('BRIDGE_APP_NOT_READY')
    payload={'protocol':PROTOCOL}
    if drain is not None:payload['drain']=drain
    req=request.Request('https://app.brazacommerce.com.br/api/hermes/heartbeat',data=json.dumps(payload,separators=(',',':')).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+key},method='POST')
    opener=request.build_opener(request.ProxyHandler({}),NoRedirect())
    try:
        with opener.open(req,timeout=15) as response:
            if response.status!=200:raise ActivationError('BRIDGE_APP_NOT_READY')
            raw=response.read(1025)
            if len(raw)>1024:raise ActivationError('BRIDGE_APP_NOT_READY')
            value=json.loads(raw)
            if type(value) is not dict or set(value) not in ({'ok','protocol'},{'ok','protocol','draining','safe_to_restart'}) or value['ok'] is not True or value['protocol']!=PROTOCOL:raise ActivationError('BRIDGE_APP_PROTOCOL_REQUIRED')
            if 'draining' in value and (type(value['draining']) is not bool or type(value['safe_to_restart']) is not bool):raise ActivationError('BRIDGE_APP_PROTOCOL_REQUIRED')
            if drain is not None and ('draining' not in value or value['draining'] is not drain):raise ActivationError('BRIDGE_APP_PROTOCOL_REQUIRED')
            if drain is True and not value['safe_to_restart']:raise ActivationError('BRIDGE_EXECUTION_IN_PROGRESS')
    except error.HTTPError as exc:
        code=exc.code;exc.close()
        raise ActivationError('BRIDGE_APP_KEY_REJECTED' if code==401 else 'BRIDGE_APP_NOT_READY') from None
    except ActivationError:raise
    except Exception:raise ActivationError('BRIDGE_APP_NOT_READY') from None

def write_file(parent,leaf,raw,mode,*,anchor='/',owner=0,group=0):
    fd=directory(parent,anchor=anchor,owner=owner)
    try:
        try:existing=os.open(leaf,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd)
        except FileNotFoundError:existing=None
        if existing is not None:
            with os.fdopen(existing,'rb') as stream:
                info=os.fstat(stream.fileno())
                if not stat.S_ISREG(info.st_mode) or info.st_uid!=owner or info.st_gid!=group or stat.S_IMODE(info.st_mode)!=mode or info.st_nlink!=1 or info.st_size!=len(raw) or stream.read(len(raw)+1)!=raw:raise ActivationError('BRIDGE_CONFIGURATION_CONFLICT')
            return
        output=os.open(leaf,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode,dir_fd=fd);created=os.fstat(output)
        try:
            with os.fdopen(output,'wb') as stream:
                os.fchown(stream.fileno(),owner,group);os.fchmod(stream.fileno(),mode);stream.write(raw);stream.flush();os.fsync(stream.fileno())
            os.fsync(fd)
        except BaseException:
            info=os.stat(leaf,dir_fd=fd,follow_symlinks=False)
            if (info.st_dev,info.st_ino)==(created.st_dev,created.st_ino):os.unlink(leaf,dir_fd=fd)
            raise
    finally:os.close(fd)

def existing_secret(*,anchor='/',owner=0,group=1000):
    fd=directory('/etc',anchor=anchor,owner=owner)
    try:
        try:file=os.open('brazacommerce-hermes-bridge.env',os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd)
        except FileNotFoundError:return None
        with os.fdopen(file,'rb') as stream:
            info=os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_uid!=owner or info.st_gid!=group or stat.S_IMODE(info.st_mode)!=0o640 or info.st_nlink!=1 or info.st_size>1024:raise ActivationError('BRIDGE_CONFIGURATION_CONFLICT')
            raw=stream.read(1025)
        match=re.fullmatch(rb'HERMES_BRIDGE_SECRET=([A-Za-z0-9_-]{32,256})\n',raw)
        if not match:raise ActivationError('BRIDGE_CONFIGURATION_CONFLICT')
        return match[1].decode('ascii')
    finally:os.close(fd)

def check_runtime():
    result=subprocess.run(['/usr/sbin/runuser','-u','hermes-mls','--','/usr/bin/python3','-B','/opt/brazacommerce-hermes-bridge/hermes_bridge.py','--check'],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=30,check=False)
    if result.returncode!=0 or result.stdout.strip()!=b'BRIDGE_RUNTIME_FLAGS_OK':raise ActivationError('BRIDGE_RUNTIME_UNAVAILABLE')

def upgrade_lock():
    fd=directory('/opt/brazacommerce-hermes-bridge')
    try:
        try:lock=os.open('.hermes_bridge.finance-v1.lock',os.O_RDWR|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd)
        except FileNotFoundError:
            lock=os.open('.hermes_bridge.finance-v1.lock',os.O_RDWR|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=fd);os.fchmod(lock,0o600)
        try:
            info=os.fstat(lock)
            if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o600 or info.st_nlink!=1:raise ActivationError('BRIDGE_CONFIGURATION_CONFLICT')
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);return lock
        except BaseException:os.close(lock);raise
    finally:os.close(fd)

def configure(key=None,*,anchor='/',owner=0,group=1000):
    if os.geteuid()!=owner:raise ActivationError('BRIDGE_ROOT_REQUIRED')
    verify(anchor=anchor,owner=owner)
    saved=existing_secret(anchor=anchor,owner=owner,group=group)
    if saved is not None:
        if key is not None and key!=saved:raise ActivationError('BRIDGE_CONFIGURATION_CONFLICT')
        key=saved
    preflight(key)
    write_file('/etc','brazacommerce-hermes-bridge.env',('HERMES_BRIDGE_SECRET='+key+'\n').encode(),0o640,anchor=anchor,owner=owner,group=group)
    write_file('/etc/systemd/system','brazacommerce-hermes-bridge.service',UNIT.encode(),0o644,anchor=anchor,owner=owner,group=owner)

def activate(key):
    lock=upgrade_lock()
    try:
        verify();check_runtime()
        try:
            preflight(key,drain=True);configure(key);preflight(key,drain=True)
            for cmd in (['/usr/bin/systemctl','daemon-reload'],['/usr/bin/systemctl','enable','brazacommerce-hermes-bridge.service'],['/usr/bin/systemctl','restart','brazacommerce-hermes-bridge.service']):
                subprocess.run(cmd,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=20,check=True)
            result=subprocess.run(['/usr/bin/systemctl','is-active','brazacommerce-hermes-bridge.service'],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=5,check=False)
            if result.returncode!=0 or result.stdout.strip()!=b'active':raise ActivationError('BRIDGE_SERVICE_NOT_ACTIVE')
        finally:
            pending_error=sys.exc_info()[0] is not None
            try:preflight(key,drain=False)
            except Exception:
                if not pending_error:raise ActivationError('BRIDGE_DRAIN_RELEASE_PENDING') from None
                print('BRIDGE_DRAIN_RELEASE_PENDING')
    finally:os.close(lock)

def main(arguments=None):
    try:
        if os.geteuid()!=0:raise ActivationError('BRIDGE_ROOT_REQUIRED')
        parser=argparse.ArgumentParser();parser.add_argument('--restart',action='store_true');options=parser.parse_args(arguments)
        if not options.restart:raise ActivationError('BRIDGE_RESTART_FLAG_REQUIRED')
        verify();check_runtime();key=existing_secret()
        if key is None:
            with warnings.catch_warnings():
                warnings.simplefilter('error',getpass.GetPassWarning)
                key=getpass.getpass('Cole HERMES_BRIDGE_SECRET (entrada oculta) e pressione Enter: ')
        activate(key);del key
        print('BRIDGE_FINANCE_PROTOCOL_OK / ADS LOCKED',flush=True);print('BRIDGE_SERVICE_ACTIVE');return 0
    except BaseException as exc:
        print(str(exc) if isinstance(exc,ActivationError) else 'BRIDGE_ACTIVATION_FAILED');return 1

if __name__=='__main__':raise SystemExit(main())
