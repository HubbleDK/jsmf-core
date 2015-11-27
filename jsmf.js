/**
 *   JavaScript Modelling Framework (JSMF)
 *
*
©2015 Luxembourg Institute of Science and Technology All Rights Reserved
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

Authors : J.S. Sottet, A Vagner
*/

// if jsmf.set('db','neo4j') { load JSMFNeo4j.js module }; // how parameter it? ip address and port number?
//var modelDB = require('./JSMFNeo4j.js'); // not direclty requiering Neo4J-JSMF
var _ = require('lodash');

//DEF: Check Type Strict, Partial, None | Check Cardinality Strict, Partial, None, ...
//Natural => Formal
function Model(name, db) {
    this.__name = name;
    this.referenceModel = {}; //set the metamodel of this
    this.modellingElements = {};
    if(db!==undefined) {
        this.modelDB=db;
    }
}

//WARNING CHECK if classs is defined
Model.prototype.setModellingElement = function (Class) {
    if (Class.__name == undefined) {
        var tab = this.modellingElements[Class.conformsTo().__name] || [];
        tab.push(Class);
        this.modellingElements[Class.conformsTo().__name] = tab;
    } else {
        var tab = [];
        tab.push(Class);
        this.modellingElements[Class.__name] = tab;

    }
};

//
Model.prototype.setModellingElements = function (ClassTab) {
    if (ClassTab instanceof Array) {
        for (i in ClassTab) {
            if (ClassTab[i].__name == undefined) { //i.e. not  a meta-element
                var tab = this.modellingElements[ClassTab[i].conformsTo().__name] || [];
                tab.push(ClassTab[i]);
                this.modellingElements[ClassTab[i].conformsTo().__name] = tab;
            } else {
                this.modellingElements[ClassTab[i].__name] = ClassTab[i];
            }
        }
    } else {
        this.setModellingElement(ClassTab);
    }
};

//Another way to put modelling elements in model.
Model.prototype.add = function (ClassTab) {
    this.setModellingElements(ClassTab);
}

//Send to JSMF Util?
Model.prototype.contains = function (ModelElement) {
    var indexM = ModelElement.conformsTo().__name;
    var result = _.includes(this.modellingElements[indexM], ModelElement);
    return result;
}


Model.prototype.Filter = function(Classifier) {
 return this.modellingElements[Classifier.__name] ;

}

Model.prototype.setReferenceModel = function (metamodel) {
    this.referenceModel = metamodel;
}


Model.prototype.save = function () {
    this.modelDB.saveModel(this);
}

Model.prototype.load = function (callback) {
    this.modelDB.loadModel(this, callback);
}

//M2
function Class(name) {
    this.__name = name;
    this.__attributes = {};
    this.__references = {};
    this.__superType = {};
}

Class.newInstance = function (classname){
    var Obj = new Class(classname);  //here check promote/demote functions
    return Obj;
};

//Class conformsTo itself (metacircularity)
Class.conformsTo = function() {
    return Class;

};

Class.prototype.setAttribute = function (name, type) {
    if (!(_.includes(this.__attributes, name))) {
        this.__attributes[name] = type;
    }
};

Class.prototype.setSuperType = function (Class) {
    this.__superType[Class.__name] = Class;
}

Class.prototype.getInheritanceChain = function() {
    if (Object.getOwnPropertyNames(this.__superType).length == 0 || this.__superType == undefined) {
        return [this];
    } else {
        return _.reduce(this.__superType,
            function (all, next) { return all.concat(next.getInheritanceChain()); },
            [this]);
    }
}

var hasClass = function (x, type) {
    var types = type instanceof Array ? type : [type];
    return _.some(x.conformsTo().getInheritanceChain(),
                  function (c) {return _.includes(types, c)});
}

//
Class.prototype.getAllReferences = function() {
    var result={};
    _.forEach(this.__references, function(elem, index) {
        result[index]=elem;
    });
    var allsuperTypes = this.getInheritanceChain();
    for(var i in allsuperTypes) {
        refSuperType = allsuperTypes[i];
        _.forEach(refSuperType.__references, function(elem, index) {
            result[index]=elem;
        });
    }
    return result;
}

Class.prototype.getAllAttributes = function() {
    var result=[];

    result.push(this.__attributes)
    var allsuperTypes = this.getInheritanceChain();
    for(var i in allsuperTypes) {
        refSuperType = allsuperTypes[i];
        result.push(refSuperType.__attributes);
    }
    return result;
}

//Instance of MetaClass is conforms to Class.
Class.prototype.conformsTo = function () {
    return Class;
};


Class.prototype.setReference = function (name, type, cardinality, opposite, composite, associated) {
    //check name?
    this.__references[name] = {
        "type": type, //should check the type
        "card": cardinality,
        "associated":associated
    }
    if (opposite !== undefined) {
        var tmp = this.__references[name];
        tmp.opposite = opposite;
    }
    if (composite !== undefined) {
         var tmp = this.__references[name];
        tmp.composite = composite;
    }

};

/******************************
//Enum definition : should extend class? or a super class classifier?
*****************************/
function Enum(name) {
    this.__name = name;
    this.__literals = {};
    return this;
}

Enum.prototype.conformsTo = function() {return Enum;}

Enum.prototype.setLiteral = function(name, value) {
     if (_.includes(this.__literals, name)) {} else {
        this.__literals[name]=value;
     }
};

Enum.prototype.getValue= function(name) {
    return this.__literals[name];
}

/****************************************************************************************
*       Building Instance: attributes and references conforms to metamodel elements
****************************************************************************************/
function makeAssignation(ob, index, attype) {
    //if attype = primitive JS type else ...
    var type = new attype;
    return function (param) {
        if (param.__proto__ == type.__proto__) {
            ob[index] = param;
        } else {
            throw new Error("Assigning wrong type: " + param.__proto__ + " expected " + type.__proto__);
            //console.log("Assigning wrong type: " + param.__proto__ + " expected " + type.__proto__);
        }
    };
}

// Adding the creation of opposite except for ARRAY of Type
function makeReference(ob, index, type, card, opposite, composite,associated) {
    ob.associated=[];
    return function assign(param,associated) {
        //CheckCardinalitie
        var elementsinrelation = ob[index].length;
        var types = type instanceof Array ? type : [type];
        if (card == 1 && elementsinrelation >= 1) {
            console.log("error trying to assign multiple elements to a single reference");
        } else if (param instanceof Array) {
            _.forEach(param, function(p) {assign(p, associated)});
        } else if (type === Class) { // <=> bypasscheckType, equivalent to oclAny
            ob[index].push(param);
            ob.associated.push({"ref":index, "elem":elementsinrelation, "associated":associated});
        } else if (hasClass(param, types)) {
             if(_.includes(ob[index],param)) {
                 console.log("Error trying to assign already assigned object of relation "+ index);
                 //maybe assigning it because of circular opposite relation
             } else {
                 ob[index].push(param); //ob[index]=param...
                 ob.associated.push({"ref":index, "elem":elementsinrelation, "associated":associated});
                 if(opposite!=undefined) {
                      param[opposite].push(ob);
                      //param[functionStr](ob); // using object function but consequently it is trying to push 2 times but have all the checks...
                      //even for inheritance?
                 }
             }
        } else {
             console.log(_.includes(param.conformsTo().getInheritanceChain()),type);
             console.log(param.conformsTo().getInheritanceChain()[0])
             //ob[index].push(param); //WARNING DO the push if type
             console.log("assigning wrong type: " + param.conformsTo().__name + " to current reference." + " Type " + type.__name + " was expected");
        }
    };
}

Class.prototype.newInstance = function (name) {
    var result = {};
    var self = this;
    var setterName = function (s) {
      return 'set' + s[0].toUpperCase() + s.slice(1);
    }

    //Get all the super types of the current instance
    var allsuperType = this.getInheritanceChain();

    //create setter for attributes from superclass
    for(var i in allsuperType) {
        refSuperType = allsuperType[i];
        for (var sup in refSuperType.__attributes) {
             result[sup] = new refSuperType.__attributes[sup]();
            var attype = refSuperType.__attributes[sup];
            result[setterName(sup)] = makeAssignation(result, sup, attype);
           }
        //do the same for references
        for (var sup in refSuperType.__references) {
            result[sup] = [];
            var type = refSuperType.__references[sup].type;
            var card = refSuperType.__references[sup].card;
            var opposite = refSuperType.__references[sup].opposite;
            var composite = refSuperType.__references[sup].composite;
            var associated = refSuperType.__references[sup].associated;
            result[setterName(sup)] = makeReference(result, sup, type, card, opposite, composite,associated); //TODO: composite specific behavior
        }
    }

    //create setter for attributes (super attributes will be overwritten if they have the same name)
    for (var i in this.__attributes) {
        if(this.__attributes[i].conformsTo== undefined) {
            result[i] = new this.__attributes[i](); //Work with JS primitve types only.
            var attype = this.__attributes[i];
        } else {
            console.log(this.__attributes[i]); //TODO: add behavior for jsmf class instance
        }
        result[setterName(i)] = makeAssignation(result, i, attype);
    }

    //create setter for references (super references will be overwritten if they have the same name)
    for (var j in this.__references) {
        result[j] = [];
        var type = this.__references[j].type;
        var card = this.__references[j].card;
        var opposite = this.__references[j].opposite;
        var composite = this.__references[j].composite;
        var associated = this.__references[j].associated;
        result[setterName(j)] = makeReference(result, j, type, card, opposite, composite,associated); // TODO: add behavior for composite
    }

    // Assign the "type" to which M1 class is conform to.
    result.conformsTo = function () {
        return self;
    };

    return result;
};

//Export three main framework functions
module.exports = {

    Class: Class,

    Model: Model,

    Enum : Enum

};
