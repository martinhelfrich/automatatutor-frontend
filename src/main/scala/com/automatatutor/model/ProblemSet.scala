package com.automatatutor.model

import net.liftweb.mapper._
import net.liftweb.common.Full
import net.liftweb.common.Empty

class ProblemSet extends LongKeyedMapper[ProblemSet] with IdPK {
	def getSingleton = ProblemSet

	object posedProblem extends MappedLongForeignKey(this, PosedProblem)
	object createdBy extends MappedLongForeignKey(this, User)
	object name extends MappedString(this, 100)
	object practiceSet extends MappedBoolean(this)

	def deleteWithProblems = {
	  // Make sure that we also delete the posed problems from the database
	  this.posedProblem.obj match {
	    case Full(problem) => problem.deleteRecursively // This will recursively remove all the posed problems
	    case _ => {} // We do not need to remove anything
	  }
	  this.delete_!
	}
	
	def getPosedProblems : Seq[PosedProblem] = {
	  this.posedProblem.obj match {
	    case Full(problem) => problem.getListRecursively
	    case _ => List()
	  }
	}
	
	def getPosedProblemsInOrder ( inRandomOrder : Boolean, seed : Int ) : Seq[PosedProblem] = {
		var posedProbList = getPosedProblems
		if (!inRandomOrder){	  
			return posedProbList;
		}
		var length = posedProbList.length	  
		val random = new scala.util.Random(seed)
		var randomList = List[PosedProblem]()
		var curLength = 0;
		for ( curLength <- (1 to length).reverse){
			var ind =random.nextInt(curLength)
			var nextEl = posedProbList(ind)			
			posedProbList= posedProbList.filter(!_.equals(nextEl))
			randomList = nextEl :: randomList 
		}
		return randomList
		
	}
	
	
	
	def getNumberOfProblems : Int = this.getPosedProblems.size
	
	def removeProblem( toRemove : PosedProblem ) = {
	  this.posedProblem.obj match {
	    case Full(problem) => if(problem.equals(toRemove)) { 
	    	this.posedProblem(problem.nextPosedProblemId.obj); problem.delete_!
	      } else { 
	    	problem.removeProblemRecursively(toRemove)
	      }
	    case _ => {} // Do nothing, we cannot remove the problem from this list if it is not in there
	  }
	}
	
	def appendProblem( problem : Problem, numberOfAttempts : Int, maxGrade : Int ) = {
	  val newPosedProblem = PosedProblem.create.problemId(problem).allowedAttempts(numberOfAttempts).maxGrade(maxGrade)
	  newPosedProblem.save
	  this.posedProblem.obj match {
	    case Full(problem) => problem.appendProblemRecursively(newPosedProblem)
	    case _ => this.posedProblem(newPosedProblem).save
	  }
	}
	
	def makePracticeSet = { this.practiceSet(true).save }
	def makeNonPracticeSet = { this.practiceSet(false).save }
	def isPracticeSet = { this.practiceSet.is }
	def isNonPracticeSet = { !this.practiceSet.is }
	def togglePracticeSet = { if (this.practiceSet.is) this.makeNonPracticeSet else this.makePracticeSet }
	
	def isPosed : Boolean = PosedProblemSet.existsForProblemSet(this)
	
	def canBeEdited : Boolean = !this.isPosed
	def getEditPreventers : Seq[String] = if(this.isPosed) { List("Problem set is posed in some course") } else { List() }
	
	def canBeDeleted : Boolean = !(this.isPosed || this.isPracticeSet)
	def getDeletePreventers : Seq[String] = (if(this.isPosed) { List("Problem set is posed in some course") } else { List() }) ++ (if(this.isPracticeSet) { List("Problem set is practice set") } else { List() })
	override def delete_! : Boolean = if(!this.canBeDeleted) { return false } else { return super.delete_! }
}

object ProblemSet extends ProblemSet with LongKeyedMetaMapper[ProblemSet] {
	def getByCreator( creator : User ) : Seq[ProblemSet] = findAll(By(ProblemSet.createdBy, creator))
	def getPracticeSets : Seq[ProblemSet] = findAll(By(ProblemSet.practiceSet, true))
}