//------------------------------------------------------------------------
//  Watson assistant for EGP inspections to wind farm
//  Using Inspection1 workspace
//------------------------------------------------------------------------
var watson = require('watson-developer-cloud');     // watson sdk
const express = require('express');
var formidable = require('formidable');
const app = express();
app.use(express.static('public'));
app.set('view engine', 'ejs');
var fs = require('fs');
// Configure cloudant database call
var Cloudant = require('cloudant');
var cloudant = Cloudant("https://1f9c36ef-0414-4735-a03a-f21820cc2f87-bluemix:cb5cc4feb6b56a0a71fcd7c586233b164bb95827a2b3d25ca817d4cea05ba759@1f9c36ef-0414-4735-a03a-f21820cc2f87-bluemix.cloudant.com");
var egp = cloudant.db.use('egp'); 
//
var uid="Raffa";
var curSite="ROMA";
var curSession="";
var curStep=0;
//-------------------------------------------------------------------------------------
// The checklist varianle contains all controls of the inspection.
// It is for demo purpose only and it should be managed as collection of
// NoSQL database documents in order to save control results (photo, comments, ratings) 
//--------------------------------------------------------------------------------------
var checklist=[];
var previous=[3,1,4];
var last_date='May 4, 2017';
//---------------------------------------------
// initialize dialog context variables
//---------------------------------------------
var initialContext={
    utente:uid,
    turbina:"WTG 3",
    plant:"ROMA",
    tempo:"",
    inspection: "si",
    ispezione_iniziata:0,    
    current_step:'',
    ncontrols:0,
    nn:0
};

var interfaccia= {
    status:1,
    text:'',
    action:'speak'
}

var currentContext=initialContext;
//---------------------------------------
// define assistant credentials
//---------------------------------------
var workspace_id = '5075b475-95e9-484e-aa4a-35427130e7da';
var assistant = watson.conversation({
    username: 'b5da2fc4-f1cd-485a-a0da-a4d035f896a1',
    password: 'gnkHoHSTNuiN',
    version: 'v1',
    tempo: 'buono',
    version_date: '2018-02-16'
});

var endpoint="http://eleme.heroku.com/";
var commento='';
var voto=0;
var fotoFile='';
//----------------------------------------------------------
// API CALLS
//----------------------------------------------------------
// Define endpoint for homepage (just acknowledge)
app.get('/', function (req, res) {
    res.send({status:1,descri:'Elementary API service is ready'});
})
  
// Define endpoint for testing API calls
app.get('/prova', function (req, res) {
      res.render('provadlg');
})

app.get('/init', function(req,res) { 
    console.log("INIT");       
    initDB()  // call checklist initialization
      .then(function (passi) {
        checklist=passi;
        initialContext.current_step=checklist[0].desc;
        initialContext.ncontrols=checklist.length;
        console.log("=====================================");
        console.log("SESSION "+curSession+" INITIALIZED");
        console.log("=====================================");            
        assistant.message({
            workspace_id: workspace_id,
                input: { text: "" },
                context: initialContext,
            }, 
            function(err,result){
                if(err) {
                    console.log("Errore assistant "+JSON.stringify(err));
                    res.send({"status":0,"message": JSON.stringify(err)});
                }
                else {
//                        interfaccia.context=result.context;
                    for(var i = 0; i<result.output.text.length;i++) {
                        interfaccia.text+=result.output.text[i]+'. ';
                    }
                    console.log("ASSISTANT: "+interfaccia.text);
                    currentContext=result.context;
                    res.send(interfaccia);    
                }
        });        
    })
})
//---------------------------------------------------------------
//  Speak
//---------------------------------------------------------------
app.post('/speak', function(req,res) {      
    var form = new formidable.IncomingForm();
    form.parse(req, function(err, fields, files) { 
        console.log("--------------------------------------");
        console.log("Start speak. Domanda: "+fields.text);
        console.log(JSON.stringify(currentContext));       
        console.log("--------------------------------------");
        console.log("");
        dialoga(fields.text,currentContext)
        .then(function(result) {
            console.log("Speak ok: "+JSON.stringify(interfaccia));
            res.send(interfaccia);
        })
        .catch(function(err) {
            console.log("speak err"+JSON.stringify(err));
            res.send({"status":0,"message": JSON.stringify(err)});
        })
    });
});

//---------------------------------------------------------------
//  Save photo
//---------------------------------------------------------------
app.post('/save_photo', function(req,res) {   
    var form = new formidable.IncomingForm();
    form.parse(req, function(err, fields, files) {
        var fotoDoc= 'photo_'+uid+'_'+new Date().getTime();
        var mioPasso=checklist[curStep].name;
        var patFoto=(files && files.file && files.file.path ? files.file.path : null);
        saveFoto(mioPasso,patFoto,fotoDoc)
        .then(function(result) {
            dialoga('ok',currentContext)
            .then(function(result) {
                console.log("Speak ok: "+JSON.stringify(interfaccia));
                res.send(interfaccia);
            })
            .catch(function(err) {
                console.log("speak err"+JSON.stringify(err));
                res.send({"status":0,"message": JSON.stringify(err)});
            })    
        })

    });
});


//--------------------------------------------------------------
// Dialoga
//--------------------------------------------------------------
function dialoga(testo,contesto) {
    return new Promise(function(resolve, reject) {
        console.log("DIALOGA STARTED "+testo);
        assistant.message({
            workspace_id: workspace_id,
            input: { text: testo },
            context : contesto,
          }, 
        function(err,result) {
            if(err) {
                console.log("SPEAK error "+JSON.stringift(err));
                reject(err);
            }
            else {
                interfaccia.text='';
                for(var i = 0; i<result.output.text.length;i++) {
                    interfaccia.text+=result.output.text[i];
                }
                if(result.context.fine_ispezione) {
                    interfaccia.action='fine_conv';
                    chiudiSessione();                  
                }
                else {
                    if(interfaccia.text.indexOf('picture')>=0 ||
                    interfaccia.text.indexOf('photo')>=0) {
                        interfaccia.action='take_photo'
                    }
                    else interfaccia.action='speak';
                    commento='';
                    voto=0;                    
                    curStep=result.context.nn;
                    if(result.context.commento) {
                        console.log("RECEIVED COMMENT "+result.context.commento);
                        commento=result.context.commento;
                    }
                    if(result.context.voto) {
                        console.log("RECEIVED COMMENT "+result.context.voto);
                        voto=result.context.voto;
                    }
                    if(result.context.ispezione_iniziata==1) {
                        result.context.nn++;
                        if(result.context.nn>=checklist.length) {
                            result.context.fine_ispezione=1;
                        }
                        else result.context.current_step = checklist[result.context.nn].desc;
                    }                    
                }
            }
            currentContext=result.context;
            console.log("Assistant text: "+interfaccia.text);
            db_update()
            .then(function(risulta) {
                console.log("db_update ok");
                resolve('ok');
            })
            .catch(function(erro) {
                console.log("Errore db_update "+erro);
                reject(erro);
            })
        })
    });
}

function saveFoto(step_id,fotoFile,fotoDoc) {
    return new Promise(function(resolve, reject) {
        console.log("MIO STEP: "+step_id);
        console.log("PATH:" +fotoFile);   
        if(fotoFile) {
        fs.readFile(fotoFile, function(err, data) {
            if (err) {
                console.log("ERRORE FILE: "+JSON.stringify(err));
                reject(err);
            }
            else {
                console.log("GOT FILE");
                egp.multipart.insert({ type:'photo'}, 
                [{name: 'photo.jpg', data: data, content_type: 'image/jpeg'}], 
                fotoDoc, function(err, body) {
                    if (err) {
                        console.log("ERRORE CREATE PHOTO: "+JSON.stringify(err));
                        reject(err);
                    }
                    else {
                        console.log("FOTO CREATA, CERCO PASSO");
                        egp.get(step_id,function(err,risu) {
                            if(err) {
                                console.log("ERROR GETTING PASSO: "+JSON.stringify(err));
                                reject(err);
                            }
                            else {
                                console.log("PASSO DA EDITARE:"+JSON.stringify(risu));
                                risu.photo=fotoDoc;
                                console.log("PASSO EDITATO:"+JSON.stringify(risu));
                                egp.insert(risu,function(err,resu){
                                    if(err) {
                                        console.log("ERROR UPDATE: "+JSON.stringify(err));
                                        reject(err)
                                    }
                                    else {
                                        console.log("STEP UPDATED");
                                        resolve('ok');
                                    }
                                });
                            }
                        })
                    }                   
                });
            }
        });
    }
    else resolve('ok');
    });
}
//---------------------------------------------------------------
//  Funzione aggiornamento database
//---------------------------------------------------------------
function db_update()
{
    return new Promise(function(resolve, reject) {
        var mioPasso=checklist[curStep].name;
        if(voto>0 && voto<=5 || commento!=null) {
            console.log("Updating step "+mioPasso);
            egp.get(mioPasso,function(err,risu) {
                if(err) {
                    console.log("ERROR GETTING PASSO: "+mioPasso);
                    reject(err);
                }
                else {
                    if(commento!=null) {
                        risu.notes=commento;
                        console.log("ADDING NOTES TO STEP:"+commento);
                        commento=null;
                    }
                    if(voto>0 && voto<=5) {
                        risu.rating=voto;
                        risu.status=1;
                        console.log("ADDING VOTE:"+voto);
                        voto=0;
                    }
                    egp.insert(risu,function(erro,resu){
                        if(erro) {
                            console.log("ERROR UPDATING STEP: "+JSON.stringify(erro));
                            reject(erro);
                        }
                        else {
                            console.log("STEP UPDATED");
                            resolve('ok');
                        }
                    });
                }
            })
        }
        else resolve('ok');
    });
}

function initDB() {
    return new Promise(function(resolve, reject) {
        egp.find({selector: {type: 'session',operator:uid,status:1},
        fields: ['_id', 'status']},
        function(er,result){
            if(er) {
                console.log("Error looking for open session "+er);
                reject(er);
            }
            if(result.docs.length==0) {
                console.log('We have to create a new session');
                curSession=uid+'_'+new Date().getTime();
                createSteps(curSession,'WTG_INSPECTION','Wtg inspection powered by Watson')
                .then(function(passi) {
                    console.log("==> CreateSessionStep - Passi: "+JSON.stringify(passi));
                    resolve(passi);
                })
                .catch(function(err) {
                    console.log ("CreteSessionFromCL - ERROR: "+err);
                    reject(err);
                })
        
            }
            else {              
                curSession=result.docs[0]._id;
                console.log("Active session already exists "+curSession);
                egp.find({selector: {type: 'session_step',session:curSession,status:0},
                fields: ['_id', 'step_desc']
                },function(erro,rispo) {
                    if(erro) {
                        console.log("errore ricerca figli");
                        reject('ko');
                    }
                    else {
                        var elencoPassi=[];
                        console.log('Trovati '+rispo.docs.length+' step');
                        rispo.docs.forEach(function(step) {
                            elencoPassi.push({name:step._id,id: step.step_id,desc:step.step_desc});
                        });
                        resolve(elencoPassi);
                    }
                })
            }
        })
    });
}

//----------------------------------------------------------------------
// Function CreateSteps
// Create all controls of a session starting from a template checklist
// ---------------------------------------------------------------------
function createSteps(session_id,template_id, descri) {
    return new Promise(function(resolve, reject) {
        var elencoPassi=[];
        var indi=0;
        console.log("creating steps for "+session_id+" basing on checklist "+template_id);
        egp.find({selector: {type: 'step',checklist_id:template_id},
            fields: ['_id', 'step_desc']
        },function(er,result) {
            console.log('Trovati '+result.docs.length+' step');
            result.docs.forEach(function(step) {
                indi++;
                elencoPassi.push({name:session_id+"_"+indi,id: step.step_id,desc:step.step_desc});
                var x=egp.insert({_id:  session_id+"_"+indi,type: 'session_step',
                session:session_id,step_desc:step.step_desc,status:0}, 
                function(err, result) {
                    if(err) {
                        console.log("Error saving step: "+JSON.stringify(err));
                        reject(err);
                    }
//                    else {
//                        console.log('Saved step '+session_id+"_"+indi);
//                    }                    
                });                 
            })
    // after creating steps, create parent session
    // if no steps are created, don't create parent.
            if(indi==0) {
                reject("No step found");
            }
            else {
                var xx=egp.insert(
                {
                    _id:  session_id,type: 'session',checklist_id:template_id,
                    checklist_description:descri,operator:uid,plant: curSite==null ? "" : curSite._id,
                    turbine: 'WTG 2',create_date: new Date().toLocaleString(),status:1},
                    function (err, resu) 
                    {
                        if(err) {
                            reject("Error in creating session");
                        }
                        else {
                            console.log("Saved session "+session_id);  
//                            console.log("Passi: "+elencoPassi); 
                            resolve(elencoPassi);               
                        }
                    }
                );
            }
        });
    });
}

function chiudiSessione()
{
    egp.get(curSession,function(err,risu) {
        if(err) {
            console.log("ERROR CLOSING SESSION: "+err);
        }
        else {
            risu.status=2;
            egp.insert(risu,function(erro,result) {
                if(erro) console.log("ERROR UPDATING SESSION: "+erro);
            })
        }
    });
}

//------------------------------------------
// Web Server start listening to http port
//------------------------------------------
var porta=process.env.PORT || 3000;
app.listen(porta, function () {
  console.log('Watson assistant started on port '+porta)
})