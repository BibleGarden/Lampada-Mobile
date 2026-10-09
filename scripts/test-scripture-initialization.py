#!/usr/bin/env python3
"""Verify first-launch catalog failure/recovery on a disposable named iOS simulator.

Install a test Release/production JS build pointing to http://127.0.0.1:9085,
start scripts/scripture-stub.mjs, and boot the named simulator first.
"""
import argparse
import json,subprocess,sys,urllib.request,sqlite3
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--simulator',choices=['Pray Smoke iPhone 17 Pro','Pray SE','Pray iPad2'],default='Pray Smoke iPhone 17 Pro')
parser.add_argument('--output',required=True)
args=parser.parse_args()
root=Path(args.output);root.mkdir(parents=True,exist_ok=True)
device=subprocess.check_output(['bash','testing/e2e/sim-udid.sh',args.simulator],text=True).strip()
def read_preferences(phase):
    container=Path(subprocess.check_output(['xcrun','simctl','get_app_container',device,'twinkler','data'],text=True).strip())
    dbfile=next(container.glob('**/lampada.db'))
    with sqlite3.connect(dbfile.as_uri()+'?mode=ro',uri=True) as db:
        values=dict(db.execute("SELECT key,value FROM meta WHERE key IN ('ui_language','scripture_preferences')"))
    (root/(phase+'-meta.json')).write_text(json.dumps(values,indent=2,ensure_ascii=False)+'\n')
    return values
def control(mode):
    req=urllib.request.Request('http://127.0.0.1:9085/__control',data=json.dumps({'catalog':mode}).encode(),headers={'Content-Type':'application/json'},method='POST')
    with urllib.request.urlopen(req,timeout=5) as resp:
        if resp.status!=200:raise RuntimeError('Stub control failed')
for phase,mode in [('failure','fail'),('recovery','ok'),('saved-offline','fail')]:
    control(mode)
    name='ios-scripture-catalog-'+phase
    argv=['maestro','--device',device,'test','--test-output-dir',str(root/name),'testing/e2e/'+name+'.yaml']
    with (root/(name+'.log')).open('w') as log:
        result=subprocess.run(argv,stdout=log,stderr=subprocess.STDOUT)
    (root/(name+'.exit')).write_text(str(result.returncode)+'\n')
    print(name+' exit='+str(result.returncode),flush=True)
    if result.returncode:sys.exit(result.returncode)
    values=read_preferences(name)
    if phase=='failure':
        assert 'scripture_preferences' not in values, 'Failure saved a Bible selection'
        assert values['ui_language']=='en'
    else:
        selection=json.loads(values['scripture_preferences'])
        assert (selection['language'],selection['translationCode'],selection['voiceCode'])==('en',16,151)
        assert values['ui_language']=='ru'
    subprocess.run(['xcrun','simctl','io',device,'screenshot',str(root/(name+'.png'))],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    print(phase+' SQLite checkpoint passed',flush=True)
control('ok')
print('All targeted catalog phases and SQLite checkpoints passed',flush=True)
